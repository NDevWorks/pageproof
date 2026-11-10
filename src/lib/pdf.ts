import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import type { PageText } from "./chunk";

// Extract text page by page so every answer can cite its page number.
export async function extractPdfPages(buffer: ArrayBuffer): Promise<PageText[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((pageText, i) => ({ page: i + 1, text: pageText }));
}
