import { Directory, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import type { GaneshReport } from "@/shared/utils/ganeshReportBuilder";
import {
  reportFileName,
  reportToCsv,
  reportToHtml,
} from "@/shared/utils/ganeshReportExport";

/**
 * Turning a report into a file the committee can keep (GS-079).
 *
 * Files, not `Share.share({ message })`. Sharing a CSV as message text — which
 * is what the Expense app does — mangles anything long, loses the `.csv`
 * association, and cannot carry a PDF at all. A committee's year-end hisab
 * should arrive as a document.
 *
 * Rendering is pure and lives in `ganeshReportExport`; this module only writes
 * and hands over, so the parts worth testing are testable without a device.
 */

/**
 * Where the report file lands.
 *
 * `Paths.document`, not cache: the OS may reclaim cache between generating the
 * file and the user picking an app in the share sheet, and a report that
 * vanishes mid-share is worse than one that never generated.
 */
function reportsDirectory(): Directory {
  const dir = new Directory(Paths.document, "ganesh-reports");
  dir.create({ idempotent: true });
  return dir;
}

async function shareFile(uri: string, mimeType: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: title, UTI: mimeType });
}

/** Write the CSV and open the share sheet. Returns the file's uri. */
export async function exportReportCsv(report: GaneshReport): Promise<string> {
  const file = new File(reportsDirectory(), reportFileName(report, "csv"));
  if (file.exists) file.delete();
  file.create();
  // UTF-8 with a BOM: without it Excel on Windows renders the rupee sign and
  // Devanagari donor names as mojibake, and donor names are exactly the part a
  // committee checks line by line.
  file.write(`﻿${reportToCsv(report)}`);
  await shareFile(file.uri, "text/csv", "Share the report");
  return file.uri;
}

/** Render the PDF and open the share sheet. Returns the file's uri. */
export async function exportReportPdf(report: GaneshReport): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html: reportToHtml(report) });

  // printToFileAsync names the file with a random id, which is useless in a
  // WhatsApp thread six months later. Rename to something self-describing.
  try {
    const source = new File(uri);
    const target = new File(reportsDirectory(), reportFileName(report, "pdf"));
    if (target.exists) target.delete();
    source.move(target);
    await shareFile(target.uri, "application/pdf", "Share the report");
    return target.uri;
  } catch {
    // A failed rename is not worth losing the report over — share the
    // original rather than making the user generate it again.
    await shareFile(uri, "application/pdf", "Share the report");
    return uri;
  }
}

/**
 * On web there is no share sheet and no document directory, so the print
 * dialog is the honest route for a PDF.
 */
export async function printReport(report: GaneshReport): Promise<void> {
  if (Platform.OS === "web") {
    await Print.printAsync({ html: reportToHtml(report) });
    return;
  }
  await exportReportPdf(report);
}
