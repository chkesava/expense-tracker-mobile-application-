import type { Account } from "@/shared/types/expense";
import type {
  RawSmsMessage,
  SmsDetectionKind,
  SmsProcessingRecord,
  SmsSkipReason,
  SmsSyncCursor,
} from "@/shared/types/smsTransaction";
import { resolveAccountFromSms } from "@/shared/utils/accountResolver";
import { adaptParsedSmsToWritePayload } from "./expenseAdapter";
import {
  buildSmsDedupeKeys,
  buildSmsFingerprint,
  findDuplicateSmsKey,
  isWeakTxnDedupeKey,
  rememberSmsDedupeKeys,
} from "./smsDedupe";
import { isExpenseOrIncomeKind } from "./smsDetector";
import {
  isExactSmsAccountMatch,
  shouldForceSmsMatchReview,
} from "./smsMatchAudit";
import { parseBankSms, type SmsParseContext } from "./smsParser";
import { loadSmsDedupeKeys, mergeSmsDedupeKeys } from "./smsDedupeStore";
import { defaultSmsReader, type SmsReader } from "./smsReader";

export interface SmsPipelineDeps {
  reader?: SmsReader;
  /** @deprecated Prefer knownDedupeKeys */
  knownFingerprints?: Set<string>;
  /** Seen refs / txn signatures / fingerprints (Phase 8) */
  knownDedupeKeys?: Set<string>;
  parseContext?: SmsParseContext;
  /** Existing users/{uid}/accounts — resolver never invents ids. */
  accounts?: Account[];
  /** When true, SMS import is disabled (default recommendation for duress) */
  blockImport?: boolean;
}

export interface SmsPipelineResult {
  records: SmsProcessingRecord[];
  writeReady: Array<{
    record: SmsProcessingRecord;
    /** ExpenseForm-compatible payload; Firestore write is a later phase */
    write: NonNullable<ReturnType<typeof adaptParsedSmsToWritePayload>>;
    /** Weak txn: collision — do not auto-add; send to review (SPENDLY-41). */
    forceReview?: boolean;
  }>;
  cursor: SmsSyncCursor;
}

function skipReasonForKind(kind: SmsDetectionKind): SmsSkipReason | null {
  switch (kind) {
    case "otp":
      return "otp";
    case "promotional":
      return "promotional";
    case "transfer":
      return "transfer";
    case "credit_card_payment":
      return "credit_card_payment";
    case "unknown":
      return "unknown";
    case "non_financial":
      return "non_financial";
    default:
      return null;
  }
}

/**
 * Orchestrates read → detect/parse → dedupe → adapt → review inbox.
 * Phase 9: writeReady candidates are parked for Add / Ignore (Firestore on Add).
 */
export async function processSmsInbox(
  deps: SmsPipelineDeps = {}
): Promise<SmsPipelineResult> {
  const reader = deps.reader ?? defaultSmsReader;
  const known =
    deps.knownDedupeKeys ??
    deps.knownFingerprints ??
    (await loadSmsDedupeKeys());
  const now = Date.now();

  if (deps.blockImport) {
    return {
      records: [],
      writeReady: [],
      cursor: { updatedAtMs: now },
    };
  }

  const capability = reader.getCapability();
  if (!capability.supported) {
    return {
      records: [],
      writeReady: [],
      cursor: { updatedAtMs: now },
    };
  }

  const permitted = await reader.hasPermission();
  if (!permitted) {
    return {
      records: [],
      writeReady: [],
      cursor: { updatedAtMs: now },
    };
  }

  const messages = await reader.readMessages({ relevantOnly: false });
  const result = processRawSmsMessages(messages, {
    knownDedupeKeys: known,
    parseContext: deps.parseContext,
    accounts: deps.accounts,
  });
  const skipKeys = result.records
    .filter((record) => record.status === "skipped")
    .flatMap((record) => record.dedupeKeys ?? []);
  if (skipKeys.length) await mergeSmsDedupeKeys(skipKeys);
  return result;
}

/** Pure path for tests / later phases feeding messages without the reader. */
export function processRawSmsMessages(
  messages: RawSmsMessage[],
  options: {
    knownFingerprints?: Set<string>;
    knownDedupeKeys?: Set<string>;
    parseContext?: SmsParseContext;
    /** Existing users/{uid}/accounts — resolver never invents ids. */
    accounts?: Account[];
  } = {}
): SmsPipelineResult {
  const known = options.knownDedupeKeys ?? options.knownFingerprints ?? new Set<string>();
  const records: SmsProcessingRecord[] = [];
  const writeReady: SmsPipelineResult["writeReady"] = [];
  let lastId: string | undefined;
  let lastAt: number | undefined;

  for (const message of messages) {
    const parsed = parseBankSms(message, options.parseContext);
    const fingerprint = buildSmsFingerprint(message, parsed);
    const dedupeKeys = buildSmsDedupeKeys(message, parsed);
    const updatedAtMs = Date.now();
    lastId = message.id;
    lastAt = message.receivedAtMs;

    const dupKey = findDuplicateSmsKey(dedupeKeys, known);
    if (dupKey && !isWeakTxnDedupeKey(dupKey)) {
      records.push({
        smsId: message.id,
        fingerprint,
        status: "skipped",
        skipReason: "duplicate",
        parsed,
        dedupeKeys,
        updatedAtMs,
      });
      continue;
    }
    const forceReview = isWeakTxnDedupeKey(dupKey);

    const kindSkip = skipReasonForKind(parsed.kind);
    if (kindSkip) {
      records.push({
        smsId: message.id,
        fingerprint,
        status: "skipped",
        skipReason: kindSkip,
        parsed,
        dedupeKeys: [`sms:${message.id}`, `fp:${fingerprint}`],
        updatedAtMs,
      });
      rememberSmsDedupeKeys(known, [`sms:${message.id}`, `fp:${fingerprint}`]);
      continue;
    }

    if (!isExpenseOrIncomeKind(parsed.kind) || parsed.confidence <= 0) {
      records.push({
        smsId: message.id,
        fingerprint,
        status: "skipped",
        skipReason: "not_transaction",
        parsed,
        dedupeKeys: [`sms:${message.id}`, `fp:${fingerprint}`],
        updatedAtMs,
      });
      rememberSmsDedupeKeys(known, [`sms:${message.id}`, `fp:${fingerprint}`]);
      continue;
    }

    const resolution = resolveAccountFromSms(
      {
        sender: message.address,
        body: message.body,
        accountLast4: parsed.accountLast4,
        paymentMethod: parsed.paymentMethod,
      },
      options.accounts ?? []
    );
    const matchForceReview = shouldForceSmsMatchReview(resolution, forceReview);
    const write = adaptParsedSmsToWritePayload(parsed, {
      accountId: isExactSmsAccountMatch(resolution)
        ? resolution.accountId
        : null,
      fingerprint,
      matchStatus: resolution.status,
      matchConfidence: resolution.confidence,
      matchedSignals: resolution.matchedSignals,
    });
    if (!write) {
      records.push({
        smsId: message.id,
        fingerprint,
        status: "skipped",
        skipReason: forceReview ? "duplicate" : "low_confidence",
        parsed,
        accountResolution: resolution,
        dedupeKeys,
        updatedAtMs,
      });
      rememberSmsDedupeKeys(known, [`sms:${message.id}`, `fp:${fingerprint}`]);
      continue;
    }

    const record: SmsProcessingRecord = {
      smsId: message.id,
      fingerprint,
      status: "parsed",
      parsed,
      accountResolution: resolution,
      dedupeKeys,
      updatedAtMs,
    };
    records.push(record);
    writeReady.push({
      record,
      write,
      forceReview: matchForceReview || undefined,
    });
    rememberSmsDedupeKeys(known, dedupeKeys);
  }

  return {
    records,
    writeReady,
    cursor: {
      lastProcessedSmsId: lastId,
      lastProcessedReceivedAtMs: lastAt,
      updatedAtMs: Date.now(),
    },
  };
}
