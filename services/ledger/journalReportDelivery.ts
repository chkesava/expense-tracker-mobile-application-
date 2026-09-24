import {
  deliverCsv,
  deliverPdf,
} from "@/services/export/fileDelivery";
import type { JournalReport } from "@/shared/utils/journalReport";
import {
  journalReportFileName,
  journalReportToCsv,
  journalReportToHtml,
} from "@/shared/utils/journalReportExport";

/**
 * Handing a Journal report to the user — SPENDLY-113.
 *
 * Thin by design: the figures are the model's, the formatting is the
 * renderers', and the file mechanics are `services/export/fileDelivery`. This
 * module only picks the file name and the directory.
 */

const DIRECTORY = "journal-reports";

export async function exportJournalReportCsv(
  report: JournalReport
): Promise<string | undefined> {
  return deliverCsv({
    content: journalReportToCsv(report),
    fileName: journalReportFileName(report, "csv"),
    directory: DIRECTORY,
    title: "Share journal report",
  });
}

export async function exportJournalReportPdf(
  report: JournalReport
): Promise<string | undefined> {
  return deliverPdf({
    html: journalReportToHtml(report),
    fileName: journalReportFileName(report, "pdf"),
    directory: DIRECTORY,
    title: "Share journal report",
  });
}
