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

// The chat endpoint streams newline-delimited JSON events in this order:
// status → sources → delta (many) → done. "error" can arrive at any point.
export type ChatEvent =
  | { type: "status"; stage: "searching" | "writing" }
  | { type: "sources"; sources: Source[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };
