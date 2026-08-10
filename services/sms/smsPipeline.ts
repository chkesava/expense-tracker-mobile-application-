import type {
  RawSmsMessage,
  SmsProcessingRecord,
  SmsSyncCursor,
} from "@/shared/types/smsTransaction";
import { adaptParsedSmsToWritePayload } from "./expenseAdapter";
import { buildSmsFingerprint } from "./smsDedupe";
import { parseBankSms, type SmsParseContext } from "./smsParser";
import { defaultSmsReader, type SmsReader } from "./smsReader";

export interface SmsPipelineDeps {
  reader?: SmsReader;
  /** Local fingerprints already seen (later: AsyncStorage-backed set) */
  knownFingerprints?: Set<string>;
  parseContext?: SmsParseContext;
  /** When true, SMS import is disabled (default recommendation for duress) */
  blockImport?: boolean;
}

export interface SmsPipelineResult {
  records: SmsProcessingRecord[];
  writeReady: Array<{
    record: SmsProcessingRecord;
    /** ExpenseForm-compatible payload; Firestore write is a later phase */
    write: NonNullable<ReturnType<typeof adaptParsedSmsToWritePayload>>;
  }>;
  cursor: SmsSyncCursor;
}

/**
 * Orchestrates read → parse → dedupe → adapt.
 * Phase 1: permission check/request live on Android; inbox read stays empty.
 */
export async function processSmsInbox(
  deps: SmsPipelineDeps = {}
): Promise<SmsPipelineResult> {
  const reader = deps.reader ?? defaultSmsReader;
  const known = deps.knownFingerprints ?? new Set<string>();
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

  const messages = await reader.readMessages();
  return processRawSmsMessages(messages, {
    knownFingerprints: known,
    parseContext: deps.parseContext,
  });
}

/** Pure path for tests / later phases feeding messages without the reader. */
export function processRawSmsMessages(
  messages: RawSmsMessage[],
  options: {
    knownFingerprints?: Set<string>;
    parseContext?: SmsParseContext;
  } = {}
): SmsPipelineResult {
  const known = options.knownFingerprints ?? new Set<string>();
  const records: SmsProcessingRecord[] = [];
  const writeReady: SmsPipelineResult["writeReady"] = [];
  let lastId: string | undefined;
  let lastAt: number | undefined;

  for (const message of messages) {
    const parsed = parseBankSms(message, options.parseContext);
    const fingerprint = buildSmsFingerprint(message, parsed);
    const updatedAtMs = Date.now();
    lastId = message.id;
    lastAt = message.receivedAtMs;

    if (known.has(fingerprint)) {
      records.push({
        smsId: message.id,
        fingerprint,
        status: "skipped",
        skipReason: "duplicate",
        parsed,
        updatedAtMs,
      });
      continue;
    }

    if (parsed.kind === "unknown" || parsed.confidence <= 0) {
      records.push({
        smsId: message.id,
        fingerprint,
        status: "skipped",
        skipReason: "not_transaction",
        parsed,
        updatedAtMs,
      });
      known.add(fingerprint);
      continue;
    }

    const write = adaptParsedSmsToWritePayload(parsed);
    if (!write) {
      records.push({
        smsId: message.id,
        fingerprint,
        status: "skipped",
        skipReason: "low_confidence",
        parsed,
        updatedAtMs,
      });
      known.add(fingerprint);
      continue;
    }

    const record: SmsProcessingRecord = {
      smsId: message.id,
      fingerprint,
      status: "parsed",
      parsed,
      updatedAtMs,
    };
    records.push(record);
    writeReady.push({ record, write });
    known.add(fingerprint);
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
