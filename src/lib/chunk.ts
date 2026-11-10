import { RAG } from "./config";

export type PageText = { page: number; text: string };
export type Chunk = { page: number; content: string };

// Split each page into overlapping chunks, preferring to break at paragraph
// or sentence boundaries so answers keep their context.
export function chunkPages(
  pages: PageText[],
  size = RAG.chunkSize,
  overlap = RAG.chunkOverlap
): Chunk[] {
  const chunks: Chunk[] = [];

  for (const { page, text } of pages) {
    const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!clean) continue;

    let start = 0;
    while (start < clean.length) {
      let end = Math.min(start + size, clean.length);

      if (end < clean.length) {
        const window = clean.slice(start, end);
        const breakAt = Math.max(
          window.lastIndexOf("\n\n"),
          window.lastIndexOf(". "),
          window.lastIndexOf("\n")
        );
        if (breakAt > size * 0.5) end = start + breakAt + 1;
      }

      const content = clean.slice(start, end).trim();
      if (content.length > 20) chunks.push({ page, content });

      if (end >= clean.length) break;
      let next = Math.max(end - overlap, start + 1);
      // Start the next chunk at a line or word boundary, not mid-word
      const lineBreak = clean.indexOf("\n", next);
      const space = clean.indexOf(" ", next);
      const boundary = lineBreak !== -1 && lineBreak < end ? lineBreak : space;
      if (boundary !== -1 && boundary < end) next = boundary + 1;
      start = next;
    }
  }

  return chunks;
}
