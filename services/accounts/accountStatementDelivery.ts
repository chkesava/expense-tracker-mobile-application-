import { Directory, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import type { AccountStatement } from "@/shared/utils/accountStatement";
import {
  statementFileName,
  statementToCsv,
  statementToHtml,
} from "@/shared/utils/accountStatementExport";

/**
 * Turning an account statement into a file the user can keep (SPENDLY-79).
 *
 * Files, not `Share.share({ message })`: a statement shared as message text
 * loses its `.csv` association, mangles anything long, and cannot carry a PDF
 * at all. A statement should arrive as a document.
 *
 * Rendering is pure and lives in `accountStatementExport`; this module only
 * writes and hands over, so everything worth testing is testable without a
 * device.
 */

/**
 * Where the statement lands.
 *
 * `Paths.document`, not cache: the OS may reclaim cache between writing the
 * file and the user picking an app in the share sheet, and a statement that
 * vanishes mid-share is worse than one that never generated.
 */
function statementsDirectory(): Directory {
  const dir = new Directory(Paths.document, "account-statements");
  dir.create({ idempotent: true });
  return dir;
}

async function shareFile(
  uri: string,
  mimeType: string,
  title: string
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: title, UTI: mimeType });
}

/**
 * Hand the CSV to the browser as a download.
 *
 * There is no document directory and no share sheet on web, so an object URL
 * on a synthetic anchor is the route that actually produces a `.csv` file the
 * user keeps.
 */
function downloadCsvOnWeb(statement: AccountStatement): void {
  const blob = new Blob([`﻿${statementToCsv(statement)}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = statementFileName(statement, "csv");
  anchor.click();
  // Revoking immediately can cancel the download in some browsers; one tick is
  // enough for the click to have been taken up.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Write the CSV and open the share sheet. Returns the file's uri. */
export async function exportStatementCsv(
  statement: AccountStatement
): Promise<string | undefined> {
  if (Platform.OS === "web") {
    downloadCsvOnWeb(statement);
    return undefined;
  }

  const file = new File(statementsDirectory(), statementFileName(statement, "csv"));
  if (file.exists) file.delete();
  file.create();
  // UTF-8 with a BOM: without it Excel on Windows renders the currency symbol
  // and any non-Latin merchant name as mojibake, and those are exactly the
  // lines a person checks one by one.
  file.write(`﻿${statementToCsv(statement)}`);
  await shareFile(file.uri, "text/csv", "Share statement");
  return file.uri;
}

/**
 * Render the PDF and hand it over.
 *
 * On web there is no share sheet and no document directory, so the print
 * dialog is the honest route — it offers "Save as PDF" and prints the same
 * HTML.
 */
export async function exportStatementPdf(
  statement: AccountStatement
): Promise<string | undefined> {
  const html = statementToHtml(statement);

  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return undefined;
  }

  const { uri } = await Print.printToFileAsync({ html });

  // printToFileAsync names the file with a random id, which is useless in a
  // mail thread six months later. Rename to something self-describing.
  try {
    const source = new File(uri);
    const target = new File(
      statementsDirectory(),
      statementFileName(statement, "pdf")
    );
    if (target.exists) target.delete();
    source.move(target);
    await shareFile(target.uri, "application/pdf", "Share statement");
    return target.uri;
  } catch {
    // A failed rename is not worth losing the document over — share the
    // original rather than making the user generate it again.
    await shareFile(uri, "application/pdf", "Share statement");
    return uri;
  }
}
