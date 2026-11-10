import type { ChatEvent, DocumentInfo, Source } from "./types";

// ---------- Conversation model (browser only) ----------

export type UserMessage = { id: string; role: "user"; content: string };
export type AssistantMessage = {
  id: string;
  role: "assistant";
  content: string;
  sources: Source[];
  status: "searching" | "writing" | "done" | "stopped" | "error";
  error?: string;
};
export type Message = UserMessage | AssistantMessage;

export const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- API calls ----------

// An error from our API, carrying a machine-readable code for the UI
export class ApiError extends Error {
  constructor(message: string, public code: string = "unknown") {
    super(message);
  }
}

export async function fetchDocuments(): Promise<DocumentInfo[]> {
  let res: Response;
  try {
    res = await fetch("/api/documents", { cache: "no-store" });
  } catch {
    throw new ApiError("You appear to be offline. Check your connection and try again.", "offline");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || "Couldn't load your library.", data.code);
  return data.documents;
}

export async function uploadDocument(file: File): Promise<DocumentInfo> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/documents", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed.");
  return data.document;
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Couldn't delete the document.");
  }
}

// Read the NDJSON stream from /api/chat and hand each event to onEvent.
export async function streamChat(
  payload: { question: string; history: { role: string; content: string }[]; documentIds: string[] },
  onEvent: (event: ChatEvent) => void,
  signal: AbortSignal
) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "The answer couldn't be generated.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

// ---------- Saved conversation (per browser) ----------

const STORAGE_KEY = "adc.conversation.v1";

export function loadConversation(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Message[];
    // An answer that was mid-stream when the page closed is shown as stopped
    return parsed.map((m) =>
      m.role === "assistant" && (m.status === "searching" || m.status === "writing")
        ? { ...m, status: "stopped" }
        : m
    );
  } catch {
    return [];
  }
}

export function saveConversation(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    // storage full or blocked: the chat still works, it just isn't saved
  }
}

// ---------- Text helpers ----------

// Which [n] markers does the answer actually use?
export function citedNumbers(text: string): Set<number> {
  return new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
}

const STOP_WORDS = new Set(
  "a an the and or of to in on for is are was were be by with what when where which who how why does do did can i my me it this that there their about from as at any".split(
    " "
  )
);

// Words from the question worth highlighting in a source passage
export function keyTerms(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    ),
  ];
}

export function formatPages(n: number) {
  return `${n} page${n === 1 ? "" : "s"}`;
}
