import { describe, expect, it } from "vitest";

import {
  CSV_LINE_ENDING,
  csvField,
  csvNumber,
  csvRow,
  joinCsvLines,
} from "./csv";

describe("csv writer (SPENDLY-113)", () => {
  describe("formula injection", () => {
    it("neutralises a cell beginning with = without losing a character of it", () => {
      // Prefixed and quoted, never stripped: an export whose promise is
      // fidelity cannot quietly edit the data on the way out.
      expect(csvField("=SUM(A1:A9)")).toBe("\"'=SUM(A1:A9)\"");
    });

    it("guards +, @, tab, carriage return and newline, not only =", () => {
      expect(csvField("+1+1")).toBe("\"'+1+1\"");
      expect(csvField("@import")).toBe("\"'@import\"");
      expect(csvField("\t=cmd|'/c calc'!A1")).toBe("\"'\t=cmd|'/c calc'!A1\"");
      expect(csvField("\r=1")).toBe("\"'\r=1\"");
      expect(csvField("\n=1")).toBe("\"'\n=1\"");
    });

    it("keeps -250 a number instead of prefixing it as a formula", () => {
      // The trap. A guard that prefixed everything starting with "-" would
      // turn every negative amount into text and break downstream SUMs.
      expect(csvField("-250")).toBe("-250");
      expect(csvField(-250)).toBe("-250");
    });

    it("leaves other legitimately numeric text alone", () => {
      expect(csvField("+1")).toBe("+1");
      expect(csvField("-0.01")).toBe("-0.01");
      expect(csvField(" -250 ")).toBe(" -250 ");
      expect(csvField("1e3")).toBe("1e3");
    });

    it("still guards a dangerous cell that merely starts with a digit-like sign", () => {
      expect(csvField("-1+cmd")).toBe("\"'-1+cmd\"");
      expect(csvField("=1")).toBe("\"'=1\"");
    });

    it("does not guard a dangerous character that is not leading", () => {
      expect(csvField("2+2")).toBe("2+2");
      expect(csvField("a=b")).toBe("a=b");
    });

    it("guards before quoting, so one pass produces one valid cell", () => {
      expect(csvField('=HYPERLINK("http://x","go")')).toBe(
        '"\'=HYPERLINK(""http://x"",""go"")"'
      );
    });
  });

  describe("RFC-4180 quoting", () => {
    it("quotes a field containing a comma", () => {
      expect(csvField("Dinner, drinks")).toBe('"Dinner, drinks"');
    });

    it("doubles an embedded quote rather than backslash-escaping it", () => {
      expect(csvField('Dinner, "Special" treats')).toBe(
        '"Dinner, ""Special"" treats"'
      );
    });

    it("quotes a field containing a newline or a bare carriage return", () => {
      expect(csvField("line one\nline two")).toBe('"line one\nline two"');
      expect(csvField("windows\r\npasted")).toBe('"windows\r\npasted"');
      expect(csvField("bare\rreturn")).toBe('"bare\rreturn"');
    });

    it("leaves an ordinary field unquoted", () => {
      expect(csvField("Groceries")).toBe("Groceries");
    });

    it("renders null, undefined and the empty string as an empty cell", () => {
      expect(csvField(null)).toBe("");
      expect(csvField(undefined)).toBe("");
      expect(csvField("")).toBe("");
    });
  });

  describe("numbers", () => {
    it("emits an empty cell for an undefined amount rather than 0", () => {
      // An empty cell says "not this side of the ledger"; a zero says
      // "nothing moved". A debit column of invented zeroes is a different
      // statement from the one the user actually has.
      expect(csvNumber(undefined)).toBe("");
      expect(csvNumber(null)).toBe("");
    });

    it("emits a real zero when the value is genuinely zero", () => {
      expect(csvNumber(0)).toBe("0");
    });

    it("writes the raw number, never a formatted currency string", () => {
      expect(csvNumber(1250.5)).toBe("1250.5");
      expect(csvNumber(-42)).toBe("-42");
    });

    it("refuses a non-finite number rather than writing NaN into a cell", () => {
      expect(csvNumber(Number.NaN)).toBe("");
      expect(csvNumber(Number.POSITIVE_INFINITY)).toBe("");
    });

    it("survives a round trip through csvRow unquoted", () => {
      expect(csvRow([csvNumber(-250), csvNumber(undefined), csvNumber(0)])).toBe(
        "-250,,0"
      );
    });
  });

  describe("rows and lines", () => {
    it("joins cells with a comma", () => {
      expect(csvRow(["Date", "Amount", "Note"])).toBe("Date,Amount,Note");
    });

    it("joins rows with CRLF, not LF", () => {
      expect(CSV_LINE_ENDING).toBe("\r\n");
      expect(joinCsvLines(["a", "b"])).toBe("a\r\nb");
    });

    it("keeps an empty line as a deliberate blank separator row", () => {
      expect(joinCsvLines(["Summary", "", "Transactions"])).toBe(
        "Summary\r\n\r\nTransactions"
      );
    });

    it("renders an empty cell list as an empty line", () => {
      expect(csvRow([])).toBe("");
    });
  });
});
