import { Directory, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/**
 * Turning a rendered document into a file the user can keep — SPENDLY-113.
 *
 * Three Spendly exports had grown their own copy of this, and the copies had
 * already drifted: one wrote a CSV with no byte-order mark, another passed a
 * MIME type where iOS wants a UTI, and only one had a web branch at all. This
 * is the one copy.
 *
 * Files, not `Share.share({ message })`: a document shared as message text
 * loses its `.csv` association, mangles anything long, and cannot carry a PDF
 * at all.
 *
 * Rendering stays pure and lives in `shared/utils/`; this module only writes
 * and hands over, so everything worth testing is testable without a device.
 */

/** iOS wants a UTI, not a MIME type. */
export const CSV_MIME = "text/csv";
export const CSV_UTI = "public.comma-separated-values-text";
export const PDF_MIME = "application/pdf";

/**
 * Where exports land.
 *
 * `Paths.document`, not cache: the OS may reclaim cache between writing the
 * file and the user picking an app in the share sheet, and a document that
 * vanishes mid-share is worse than one that never generated.
 */
export function exportDirectory(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  dir.create({ idempotent: true });
  return dir;
}

export async function shareFile(
  uri: string,
  mimeType: string,
  title: string,
  uti?: string
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: title, UTI: uti ?? mimeType });
}

/**
 * Hand a text document to the browser as a download.
 *
 * There is no document directory and no share sheet on web, so an object URL
 * on a synthetic anchor is the route that actually produces a file the user
 * keeps.
 */
function downloadOnWeb(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([`﻿${content}`], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // Revoking immediately can cancel the download in some browsers; one tick is
  // enough for the click to have been taken up.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function deliverCsv(args: {
  content: string;
  fileName: string;
  directory: string;
  title: string;
}): Promise<string | undefined> {
  if (Platform.OS === "web") {
    downloadOnWeb(args.content, args.fileName, CSV_MIME);
    return undefined;
  }

  const file = new File(exportDirectory(args.directory), args.fileName);
  if (file.exists) file.delete();
  file.create();
  // UTF-8 with a BOM: without it Excel on Windows renders the currency symbol
  // and any non-Latin merchant name as mojibake, and those are exactly the
  // lines a person checks one by one.
  file.write(`﻿${args.content}`);
  await shareFile(file.uri, CSV_MIME, args.title, CSV_UTI);
  return file.uri;
}

/**
 * Render a PDF and hand it over.
 *
 * On web there is no share sheet and no document directory, so the print
 * dialog is the honest route — it offers "Save as PDF" and prints the same
 * HTML.
 */
export async function deliverPdf(args: {
  html: string;
  fileName: string;
  directory: string;
  title: string;
}): Promise<string | undefined> {
  if (Platform.OS === "web") {
    await Print.printAsync({ html: args.html });
    return undefined;
  }

  const { uri } = await Print.printToFileAsync({ html: args.html });

  // printToFileAsync names the file with a random id, which is useless in a
  // mail thread six months later. Rename to something self-describing.
  try {
    const source = new File(uri);
    const target = new File(exportDirectory(args.directory), args.fileName);
    if (target.exists) target.delete();
    source.move(target);
    await shareFile(target.uri, PDF_MIME, args.title);
    return target.uri;
  } catch {
    // A failed rename is not worth losing the document over — share the
    // original rather than making the user generate it again.
    await shareFile(uri, PDF_MIME, args.title);
    return uri;
  }
}
