import { deliverCsv, deliverPdf } from "@/services/export/fileDelivery";
import type { AccountStatement } from "@/shared/utils/accountStatement";
import {
  statementFileName,
  statementToCsv,
  statementToHtml,
} from "@/shared/utils/accountStatementExport";

/**
 * Turning an account statement into a file the user can keep (SPENDLY-79).
 *
 * SPENDLY-113 moved the write-and-share mechanics into
 * `services/export/fileDelivery`, which this module had been the reference
 * implementation for. The behaviour is unchanged except that the share sheet
 * now receives a real UTI for CSV rather than a MIME type in the UTI slot.
 *
 * Rendering is pure and lives in `accountStatementExport`; this module only
 * picks the file name, so everything worth testing is testable without a
 * device.
 */

const DIRECTORY = "account-statements";

/** Write the CSV and open the share sheet. Returns the file's uri. */
export async function exportStatementCsv(
  statement: AccountStatement
): Promise<string | undefined> {
  return deliverCsv({
    content: statementToCsv(statement),
    fileName: statementFileName(statement, "csv"),
    directory: DIRECTORY,
    title: "Share statement",
  });
}

/** Render the PDF and hand it over. */
export async function exportStatementPdf(
  statement: AccountStatement
): Promise<string | undefined> {
  return deliverPdf({
    html: statementToHtml(statement),
    fileName: statementFileName(statement, "pdf"),
    directory: DIRECTORY,
    title: "Share statement",
  });
}
