import { isValidDateKey } from "./dates";
import { roundMoney } from "./money";

export type StatementLineKind = "debit" | "credit";

export type StatementLine = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  kind: StatementLineKind;
  raw: string;
};

export type ParseStatementResult = {
  lines: StatementLine[];
  statementTotal?: number;
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const HEADER_HINT =
  /^(date|txn|transaction|value date|narration|description|particulars|debit|credit|amount|type)\b/i;

const TOTAL_HINT =
  /(?:total\s*(?:due|amount|outstanding)|amount\s*due|closing\s*(?:balance|outstanding)|statement\s*(?:amount|total|due))/i;

const CREDIT_NARRATION =
  /\b(payment\s+received|thank\s+you(?:\s+for(?:\s+your)?\s+payment)?|upi\s*cr|refund|reversal|payment\s+towards)\b/i;

const DATE_TOKEN =
  /(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if ((character === "," || character === "\t") && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += character;
  }
  cells.push(value.trim());
  return cells;
}

function parseAmountToken(raw: string): number | null {
  const cleaned = raw
    .replace(/[₹$]|rs\.?|inr/gi, "")
    .replace(/[()]/g, "")
    .replace(/,/g, "")
    .replace(/^-/, "")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return roundMoney(n);
}

function isNegativeAmount(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith("-") || /^\(.*\)$/.test(trimmed);
}

function calendarDate(year: number, month: number, day: number): string | null {
  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidDateKey(key) ? key : null;
}

function parseDateToken(raw: string): string | null {
  const value = raw.trim();
  const iso = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (iso) {
    return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const dmy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return calendarDate(year, month, day);
  }
  const named = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    return calendarDate(Number(named[3]), month, Number(named[1]));
  }
  return isValidDateKey(value) ? value : null;
}

function detectKind(merchant: string, explicit?: string): StatementLineKind {
  const type = (explicit || "").trim().toLowerCase();
  if (/^(cr|c|credit)$/.test(type)) return "credit";
  if (/^(dr|d|debit)$/.test(type)) return "debit";
  if (CREDIT_NARRATION.test(merchant)) return "credit";
  return "debit";
}

function findHeaderIndex(headers: string[], possibilities: string[]): number {
  for (const candidate of possibilities) {
    const exact = headers.findIndex((header) => header === candidate);
    if (exact >= 0) return exact;
  }
  return headers.findIndex((header) =>
    possibilities.some((candidate) => header.includes(candidate))
  );
}

function extractStatementTotal(text: string): number | undefined {
  const match = text.match(
    /(?:total\s*(?:due|amount|outstanding)|amount\s*due|closing\s*(?:balance|outstanding)|statement\s*(?:amount|total|due))\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  if (!match) return undefined;
  return parseAmountToken(match[1]) ?? undefined;
}

function looksLikeCsvHeader(headers: string[]): boolean {
  return headers.some((header) =>
    /^(date|txn date|transaction date|value date)$/.test(header)
  ) && headers.some((header) =>
    /narrat|desc|particular|merchant|debit|credit|amount/.test(header)
  );
}

/** Join unquoted thousands groups (`1,299.00` split into `1` + `299.00`). */
function coalesceThousands(cells: string[], expected: number): string[] {
  if (cells.length <= expected) return cells;
  const merged: string[] = [];
  for (const cell of cells) {
    const prev = merged[merged.length - 1];
    if (prev && /^\d{1,3}$/.test(prev) && /^\d{2,3}(?:\.\d{1,2})?$/.test(cell)) {
      merged[merged.length - 1] = `${prev}${cell}`;
    } else {
      merged.push(cell);
    }
  }
  return merged;
}

function parseCsv(contents: string): { recognized: boolean; lines: StatementLine[] } {
  const rows = contents
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length < 2) return { recognized: false, lines: [] };

  const headers = splitCsvLine(rows[0]).map((h) => h.toLowerCase());
  if (!looksLikeCsvHeader(headers)) return { recognized: false, lines: [] };

  const dateIdx = findHeaderIndex(headers, [
    "date",
    "txn date",
    "transaction date",
    "value date",
  ]);
  const merchantIdx = findHeaderIndex(headers, [
    "narration",
    "description",
    "particular",
    "merchant",
    "details",
  ]);
  const debitIdx = findHeaderIndex(headers, ["debit", "withdrawal", "dr amount"]);
  const creditIdx = findHeaderIndex(headers, ["credit", "deposit", "cr amount"]);
  const amountIdx = headers.findIndex(
    (header) =>
      (header === "amount" || header.includes("amount")) &&
      !header.includes("debit") &&
      !header.includes("credit")
  );
  const typeIdx = findHeaderIndex(headers, ["type", "dr/cr", "transaction type"]);

  if (dateIdx < 0) return { recognized: true, lines: [] };

  const lines: StatementLine[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = coalesceThousands(splitCsvLine(rows[i]), headers.length);
    const date = parseDateToken(cells[dateIdx] || "");
    if (!date) continue;
    const merchant = (
      merchantIdx >= 0 ? cells[merchantIdx] : cells[1] || "Statement charge"
    ).trim();
    const debit = debitIdx >= 0 ? parseAmountToken(cells[debitIdx] || "") : null;
    const credit = creditIdx >= 0 ? parseAmountToken(cells[creditIdx] || "") : null;
    const amountRaw = amountIdx >= 0 ? cells[amountIdx] || "" : "";
    const typedAmount = amountIdx >= 0 ? parseAmountToken(amountRaw) : null;
    const typeCell = typeIdx >= 0 ? cells[typeIdx] : "";

    let amount = 0;
    let kind: StatementLineKind = "debit";
    if (debit && !credit) {
      amount = debit;
      kind = "debit";
    } else if (credit && !debit) {
      amount = credit;
      kind = "credit";
    } else if (typedAmount) {
      amount = typedAmount;
      kind = isNegativeAmount(amountRaw)
        ? "credit"
        : detectKind(merchant, typeCell);
    } else {
      continue;
    }

    lines.push({
      id: `stmt-${i}-${date}-${amount}-${kind}`,
      date,
      merchant: merchant || "Statement charge",
      amount,
      kind,
      raw: rows[i],
    });
  }
  return { recognized: true, lines };
}

function parseLooseLine(raw: string, index: number): StatementLine | null {
  const line = raw.trim();
  if (!line || HEADER_HINT.test(line) || TOTAL_HINT.test(line)) return null;

  const dateMatch = line.match(DATE_TOKEN);
  if (!dateMatch || dateMatch.index == null) return null;
  const date = parseDateToken(dateMatch[1]);
  if (!date) return null;

  const withoutDate = `${line.slice(0, dateMatch.index)} ${line.slice(
    dateMatch.index + dateMatch[0].length
  )}`.trim();
  const amountMatch = withoutDate.match(
    /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d{2,})(?:\s*(dr|cr|debit|credit))?\s*$/i
  );
  if (!amountMatch || amountMatch.index == null) return null;
  const amount = parseAmountToken(amountMatch[1]);
  if (!amount) return null;

  const merchant =
    withoutDate
      .slice(0, amountMatch.index)
      .replace(/\s+/g, " ")
      .trim() || "Statement charge";
  const kind = detectKind(merchant, amountMatch[2]);

  return {
    id: `stmt-${index}-${date}-${amount}-${kind}`,
    date,
    merchant,
    amount,
    kind,
    raw: line,
  };
}

/**
 * Parse a bank CSV or pasted statement text into dated debit/credit lines.
 * On-device only — never uploads the file.
 */
export function parseStatementLines(input: string): ParseStatementResult {
  const text = (input || "").trim();
  if (!text) return { lines: [] };

  const statementTotal = extractStatementTotal(text);
  const csv = parseCsv(text);
  if (csv.recognized) {
    return { lines: csv.lines, statementTotal };
  }

  const lines: StatementLine[] = [];
  text.split(/\r?\n/).forEach((row, index) => {
    const parsed = parseLooseLine(row, index);
    if (parsed) lines.push(parsed);
  });
  return { lines, statementTotal };
}

export function sumStatementDebits(lines: StatementLine[]): number {
  return roundMoney(
    lines.filter((line) => line.kind === "debit").reduce((sum, line) => sum + line.amount, 0)
  );
}

export function statementDateWindow(
  lines: StatementLine[]
): { start: string; end: string } | null {
  if (lines.length === 0) return null;
  const dates = lines.map((line) => line.date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}
