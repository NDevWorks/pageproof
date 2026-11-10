// The document library lives in this browser (IndexedDB). Files never leave the device.
import { createStore, del, get, set } from "idb-keyval";
import { chunkPages, type PageText } from "./chunk";
import { LIMITS, SEARCH } from "./config";
import { bm25 } from "./search";
import type { DocumentInfo, Source, StoredChunk } from "./types";

const store = typeof indexedDB !== "undefined" ? createStore("pageproof", "library") : undefined;
const DOCS_KEY = "documents";
const chunksKey = (id: string) => `chunks:${id}`;

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

async function readPdf(file: File): Promise<PageText[]> {
  // Loaded on demand so the first page load stays light
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
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

  const pages = await readPdf(file);
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
  };
  const stored: StoredChunk[] = chunks.map((c) => ({ documentId: doc.id, page: c.page, content: c.content }));

  try {
    await set(chunksKey(doc.id), stored, s);
    await set(DOCS_KEY, [doc, ...(await listDocuments())], s);
  } catch {
    await del(chunksKey(doc.id), s).catch(() => {});
    throw new LibraryError("Not enough browser storage to save this document.");
  }
  return doc;
}

export async function deleteDocument(id: string): Promise<void> {
  const s = requireStore();
  await set(DOCS_KEY, (await listDocuments()).filter((d) => d.id !== id), s);
  await del(chunksKey(id), s);
}

// Find the passages that best match a question, numbered for citation.
export async function findPassages(question: string, documentIds: string[], topK = SEARCH.topK): Promise<Source[]> {
  const s = requireStore();
  const docs = await listDocuments();
  const scope = documentIds.length ? docs.filter((d) => documentIds.includes(d.id)) : docs;
  const names = new Map(scope.map((d) => [d.id, d.name]));

  const all: StoredChunk[] = [];
  for (const d of scope) all.push(...((await get<StoredChunk[]>(chunksKey(d.id), s)) ?? []));

  const results = bm25(question, all, topK);
  const best = results[0]?.score || 1;
  return results.map((r, i) => ({
    n: i + 1,
    documentId: r.item.documentId,
    documentName: names.get(r.item.documentId) ?? "Document",
    page: r.item.page,
    excerpt: r.item.content,
    similarity: Math.round((r.score / best) * 100) / 100,
  }));
}
