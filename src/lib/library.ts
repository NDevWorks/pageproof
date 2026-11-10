// The document library lives in this browser (IndexedDB). Files never leave the device.
import { createStore, del, get, set } from "idb-keyval";
import { chunkPages, type PageText } from "./chunk";
import { LIMITS, SEARCH } from "./config";
import { bm25 } from "./search";
import type { DocumentInfo, Source, StoredChunk } from "./types";

const store = typeof indexedDB !== "undefined" ? createStore("pageproof", "library") : undefined;
const DOCS_KEY = "documents";
const chunksKey = (id: string) => `chunks:${id}`;
const fileKey = (id: string) => `file:${id}`;

export class LibraryError extends Error {}

function requireStore() {
  if (!store) throw new LibraryError("This browser can't store documents. Try a different browser.");
  return store;
}

export async function listDocuments(): Promise<DocumentInfo[]> {
  try {
    return (await get<DocumentInfo[]>(DOCS_KEY, requireStore())) ?? [];
  } catch (err) {
    if (err instanceof LibraryError) throw err;
    throw new LibraryError("Your library couldn't be opened. Private browsing can block storage.");
  }
}

// PDF.js may take ownership of the bytes it's given, so always hand it a copy
export async function openPdf(bytes: Uint8Array) {
  const { getDocumentProxy } = await import("unpdf");
  return getDocumentProxy(bytes.slice());
}

async function readPdf(bytes: Uint8Array): Promise<PageText[]> {
  const { extractText } = await import("unpdf");
  try {
    const pdf = await openPdf(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    return text.map((t, i) => ({ page: i + 1, text: t }));
  } catch {
    throw new LibraryError("This PDF couldn't be read. It may be damaged or password-protected.");
  }
}

export async function addDocument(file: File): Promise<DocumentInfo> {
  const s = requireStore();
  if (file.size > LIMITS.maxFileSizeMb * 1024 * 1024) {
    throw new LibraryError(`This file is over ${LIMITS.maxFileSizeMb} MB.`);
  }
  const docs = await listDocuments();
  if (docs.length >= LIMITS.maxDocuments) {
    throw new LibraryError(`Your library is full (${LIMITS.maxDocuments} documents). Delete one first.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pages = await readPdf(bytes);
  if (pages.length > LIMITS.maxPages) {
    throw new LibraryError(`This PDF has ${pages.length} pages. The limit is ${LIMITS.maxPages}.`);
  }
  const chunks = chunkPages(pages);
  if (chunks.length === 0) {
    throw new LibraryError("No text found. Scanned PDFs need text recognition (OCR) first.");
  }

  const doc: DocumentInfo = {
    id: crypto.randomUUID(),
    name: file.name,
    page_count: pages.length,
    chunk_count: chunks.length,
    created_at: new Date().toISOString(),
    has_file: false,
  };
  const stored: StoredChunk[] = chunks.map((c) => ({ documentId: doc.id, page: c.page, content: c.content }));

  try {
    await set(chunksKey(doc.id), stored, s);
  } catch {
    throw new LibraryError("Not enough browser storage to save this document.");
  }

  // Keep the original so its pages can be shown. If storage is tight, search still works without it.
  try {
    await set(fileKey(doc.id), bytes, s);
    doc.has_file = true;
  } catch {
    doc.has_file = false;
  }

  try {
    await set(DOCS_KEY, [doc, ...(await listDocuments())], s);
  } catch {
    await del(chunksKey(doc.id), s).catch(() => {});
    await del(fileKey(doc.id), s).catch(() => {});
    throw new LibraryError("Not enough browser storage to save this document.");
  }
  return doc;
}

export async function deleteDocument(id: string): Promise<void> {
  const s = requireStore();
  await set(DOCS_KEY, (await listDocuments()).filter((d) => d.id !== id), s);
  await del(chunksKey(id), s);
  await del(fileKey(id), s);
}

export async function getDocumentFile(id: string): Promise<Uint8Array | undefined> {
  return get<Uint8Array>(fileKey(id), requireStore());
}

export async function getChunks(id: string): Promise<StoredChunk[]> {
  return (await get<StoredChunk[]>(chunksKey(id), requireStore())) ?? [];
}

// Find the passages that best match a question, numbered for citation.
// Several phrasings (e.g. the question plus an English translation) can be searched at once.
export async function findPassages(
  queries: string | string[],
  documentIds: string[],
  topK = SEARCH.topK
): Promise<Source[]> {
  const docs = await listDocuments();
  const scope = documentIds.length ? docs.filter((d) => documentIds.includes(d.id)) : docs;
  const names = new Map(scope.map((d) => [d.id, d.name]));

  const all: StoredChunk[] = [];
  for (const d of scope) all.push(...(await getChunks(d.id)));

  // Best score per passage across all phrasings, each normalised to its own top result
  const best = new Map<StoredChunk, number>();
  for (const q of Array.isArray(queries) ? queries : [queries]) {
    const results = bm25(q, all, topK);
    const top = results[0]?.score || 1;
    for (const r of results) best.set(r.item, Math.max(best.get(r.item) ?? 0, r.score / top));
  }

  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([chunk, score], i) => ({
      n: i + 1,
      documentId: chunk.documentId,
      documentName: names.get(chunk.documentId) ?? "Document",
      page: chunk.page,
      excerpt: chunk.content,
      similarity: Math.round(score * 100) / 100,
    }));
}
