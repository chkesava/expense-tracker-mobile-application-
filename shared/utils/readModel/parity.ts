import { timestampMillis, type ReadModelRow, type TableSpec } from "./mapping";

/**
 * SPENDLY-510 — field-level parity: the row the mapper builds from the
 * Firestore document (the oracle) vs the row the read model holds.
 * Returns the names of the columns that differ, never their values.
 */
export function typedColumns(spec: TableSpec): string[] {
  return [...spec.fields.map((f) => f.column), ...(spec.derivedMonth ? ["month"] : []), "mapping_status"];
}

const blank = (v: unknown) => v === null || v === undefined;

function same(type: string, expected: unknown, actual: unknown): boolean {
  if (blank(expected) || blank(actual)) return blank(expected) && blank(actual);
  switch (type) {
    case "money":
      return Number(expected).toFixed(2) === Number(actual).toFixed(2);
    case "integer":
      return Number(expected) === Number(actual);
    case "date":
      return String(expected).slice(0, 10) === String(actual).slice(0, 10);
    case "timestamp":
      return timestampMillis(expected) === timestampMillis(actual);
    default:
      return expected === actual;
  }
}

export function typedDifferences(spec: TableSpec, expected: ReadModelRow, actual: Record<string, unknown> | undefined): string[] {
  if (!actual) return ["(row missing)"];
  const types = new Map<string, string>(spec.fields.map((f) => [f.column, f.type]));
  return typedColumns(spec).filter((column) => !same(types.get(column) ?? "text", expected[column], actual[column]));
}
