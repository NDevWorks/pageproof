// Shared types for the browser app.

export type DocumentInfo = {
  id: string;
  name: string;
  page_count: number;
  chunk_count: number;
  created_at: string;
  has_file?: boolean; // original PDF kept, so pages can be shown
};

export type StoredChunk = {
  documentId: string;
  page: number;
  content: string;
};

export type Source = {
  n: number; // citation number shown as [n] in the answer
  documentId: string;
  documentName: string;
  page: number;
  excerpt: string;
  similarity: number; // 0–1, relative match strength within this search
};
