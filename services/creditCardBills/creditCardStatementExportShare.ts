import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  buildCreditCardCycleExport,
  creditCardCycleExportFileName,
  creditCardCycleExportToCsv,
  type BuildCreditCardCycleExportInput,
} from "@/shared/utils/creditCardStatementExport";

function exportDirectory(): Directory {
  const dir = new Directory(Paths.document, "credit-card-exports");
  dir.create({ idempotent: true });
  return dir;
}

/**
 * Build the cycle CSV and open the system share sheet as a real file
 * (not a truncated message body).
 */
export async function shareCreditCardCycleExport(
  input: BuildCreditCardCycleExportInput
): Promise<{ fileName: string; rowCount: number }> {
  const exported = buildCreditCardCycleExport(input);
  const csv = creditCardCycleExportToCsv(exported);
  const fileName = creditCardCycleExportFileName(exported);
  const file = new File(exportDirectory(), fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device");
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    dialogTitle: `Export ${exported.periodStart} → ${exported.periodEnd}`,
    UTI: "public.comma-separated-values-text",
  });

  return { fileName, rowCount: exported.totals.rowCount };
}
