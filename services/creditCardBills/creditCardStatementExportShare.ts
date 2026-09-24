import { deliverCsv } from "@/services/export/fileDelivery";
import {
  buildCreditCardCycleExport,
  creditCardCycleExportFileName,
  creditCardCycleExportToCsv,
  type BuildCreditCardCycleExportInput,
} from "@/shared/utils/creditCardStatementExport";

/**
 * Build the cycle CSV and open the system share sheet as a real file
 * (not a truncated message body).
 *
 * SPENDLY-113 moved this onto `services/export/fileDelivery`, which brings two
 * fixes it did not have: the UTF-8 byte-order mark Excel on Windows needs to
 * render a currency symbol, and a web branch — on web this previously tried to
 * write into a document directory that does not exist there.
 */
export async function shareCreditCardCycleExport(
  input: BuildCreditCardCycleExportInput
): Promise<{ fileName: string; rowCount: number }> {
  const exported = buildCreditCardCycleExport(input);
  const fileName = creditCardCycleExportFileName(exported);

  await deliverCsv({
    content: creditCardCycleExportToCsv(exported),
    fileName,
    directory: "credit-card-exports",
    title: `Export ${exported.periodStart} → ${exported.periodEnd}`,
  });

  return { fileName, rowCount: exported.totals.rowCount };
}
