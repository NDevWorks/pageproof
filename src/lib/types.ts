// Shared between server routes and the browser UI.

export type DocumentInfo = {
  id: string;
  name: string;
  page_count: number;
  chunk_count: number;
  created_at: string;
};

export type Source = {
  n: number; // citation number shown as [n] in the answer
  documentId: string;
  documentName: string;
  page: number;
  excerpt: string;
  similarity: number;
};

export type ChatResponse = {
  answer: string;
  sources: Source[];
};
