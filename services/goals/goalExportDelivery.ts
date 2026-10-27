import { deliverCsv, deliverPdf } from "@/services/export/fileDelivery";
import { goalExportFileName, goalsToCsv, goalsToHtml, type GoalExportInput } from "@/shared/utils/goalExport";

/**
 * SPENDLY-611 — Save Goals export delivery (FRD FR-10): the pure builders in
 * shared/utils/goalExport, handed to the app's shared CSV/PDF delivery
 * (share sheet on native, download/print on web). Nothing here reads data.
 */
const DIRECTORY = "goal-exports";

export async function deliverGoalsCsv(input: GoalExportInput): Promise<void> {
  await deliverCsv({ content: goalsToCsv(input), fileName: goalExportFileName(input.rangeLabel, "csv"), directory: DIRECTORY, title: input.title });
}

export async function deliverGoalsPdf(input: GoalExportInput): Promise<void> {
  await deliverPdf({ html: goalsToHtml(input), fileName: goalExportFileName(input.rangeLabel, "pdf"), directory: DIRECTORY, title: input.title });
}
