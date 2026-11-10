"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatResponse, DocumentInfo, Source } from "@/lib/types";

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; sources: Source[] };

export default function Home() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<Source | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const loadDocuments = useCallback(async () => {
    const res = await fetch("/api/documents");
    const data = await res.json();
    if (res.ok) setDocuments(data.documents);
    else setError(data.error);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) setError(`${file.name}: ${data.error}`);
    }
    await loadDocuments();
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function remove(id: string) {
    if (!confirm("Delete this document?")) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error);
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    loadDocuments();
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || thinking) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setQuestion("");
    setThinking(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history, documentIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const { answer, sources } = data as ChatResponse;
      setMessages((m) => [...m, { role: "assistant", content: answer, sources }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setThinking(false);
    }
  }

  const scope =
    selected.size === 0
      ? "Searching all documents"
      : `Searching ${selected.size} selected document${selected.size > 1 ? "s" : ""}`;

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar: documents */}
      <aside className="flex w-full flex-col border-b border-border bg-surface md:h-full md:w-80 md:border-b-0 md:border-r">
        <div className="p-5">
          <h1 className="text-lg font-semibold">AI Document Chat</h1>
          <p className="mt-1 text-sm text-muted">Ask questions. Get answers with sources.</p>
        </div>

        <div className="px-5">
          <label
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm transition hover:border-accent hover:bg-accent-soft ${uploading ? "pointer-events-none opacity-60" : ""}`}
          >
            <span className="font-medium">{uploading ? "Processing…" : "Upload PDF"}</span>
            <span className="mt-1 text-xs text-muted">Up to 10 MB each</span>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />
          </label>
        </div>

        <div className="mt-5 flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Documents ({documents.length})
          </p>
          {documents.length === 0 && (
            <p className="px-2 text-sm text-muted">No documents yet.</p>
          )}
          <ul className="space-y-1">
            {documents.map((d) => (
              <li
                key={d.id}
                className={`group flex items-start gap-2 rounded-md px-2 py-2 text-sm ${selected.has(d.id) ? "bg-accent-soft" : "hover:bg-background"}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(d.id)}
                  onChange={() => toggle(d.id)}
                  className="mt-1 accent-[var(--accent)]"
                  aria-label={`Search only ${d.name}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" title={d.name}>{d.name}</p>
                  <p className="text-xs text-muted">{d.page_count} pages</p>
                </div>
                <button
                  onClick={() => remove(d.id)}
                  className="text-xs text-muted opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                  aria-label={`Delete ${d.name}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Chat */}
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-10">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.length === 0 && (
              <div className="mt-16 text-center">
                <h2 className="text-2xl font-semibold">Ask your documents anything</h2>
                <p className="mt-2 text-muted">
                  Upload a contract, manual, or report, then ask questions in plain language.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {["Summarise this document", "What are the key dates?", "List the main risks"].map(
                    (s) => (
                      <button
                        key={s}
                        onClick={() => setQuestion(s)}
                        className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:border-accent"
                      >
                        {s}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-accent px-4 py-2.5 text-white dark:text-[#10201a]">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="rounded-2xl border border-border bg-surface p-5">
                  <Answer text={m.content} sources={m.sources} onCite={setOpenSource} />
                  {m.sources.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                      {m.sources.map((s) => (
                        <button
                          key={s.n}
                          onClick={() => setOpenSource(s)}
                          className="rounded-md bg-accent-soft px-2.5 py-1 text-xs hover:ring-1 hover:ring-accent"
                        >
                          [{s.n}] {s.documentName} · p.{s.page}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {thinking && <p className="text-sm text-muted">Reading your documents…</p>}
            <div ref={bottom} />
          </div>
        </div>

        {error && (
          <div className="mx-auto mb-2 w-full max-w-3xl px-4">
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
              {error}
            </p>
          </div>
        )}

        <form onSubmit={ask} className="border-t border-border bg-surface px-4 py-4 md:px-10">
          <div className="mx-auto max-w-3xl">
            <p className="mb-2 text-xs text-muted">{scope}</p>
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={documents.length ? "Ask a question…" : "Upload a PDF to get started"}
                disabled={documents.length === 0}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-3 outline-none focus:border-accent disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!question.trim() || thinking}
                className="rounded-lg bg-accent px-5 font-medium text-white disabled:opacity-50 dark:text-[#10201a]"
              >
                Ask
              </button>
            </div>
          </div>
        </form>
      </main>

      {/* Source viewer */}
      {openSource && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpenSource(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-xl bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-muted">Source [{openSource.n}]</p>
                <h3 className="font-semibold">
                  {openSource.documentName} · page {openSource.page}
                </h3>
              </div>
              <button onClick={() => setOpenSource(null)} className="text-muted hover:text-foreground">
                Close
              </button>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{openSource.excerpt}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Render the answer with clickable [n] citations
function Answer({
  text,
  sources,
  onCite,
}: {
  text: string;
  sources: Source[];
  onCite: (s: Source) => void;
}) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        const source = match && sources.find((s) => s.n === Number(match[1]));
        if (source) {
          return (
            <button
              key={i}
              onClick={() => onCite(source)}
              className="mx-0.5 rounded bg-accent-soft px-1 text-xs font-medium text-accent hover:ring-1 hover:ring-accent"
            >
              {source.n}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}
