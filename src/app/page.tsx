"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SYSTEM_PROMPT,
  buildContext,
  citedNumbers,
  keyTerms,
  loadConversation,
  saveConversation,
  uid,
  type AssistantMessage,
  type Message,
} from "@/lib/client";
import { LibraryError, addDocument, deleteDocument, findPassages, listDocuments } from "@/lib/library";
import {
  ProviderError,
  loadAiSettings,
  providerName,
  saveAiSettings,
  streamAnswer,
  type AiSettings,
} from "@/lib/providers";
import type { DocumentInfo } from "@/lib/types";
import { LIMITS, SEARCH } from "@/lib/config";
import { ConnectAI } from "@/components/ConnectAI";
import { Library, type UploadItem } from "@/components/Library";
import { Conversation } from "@/components/Conversation";
import { Composer } from "@/components/Composer";
import { EvidencePanel } from "@/components/EvidencePanel";
import { Toasts, type Toast } from "@/components/Toasts";
import { ArrowDownIcon, CloseIcon, MenuIcon, PlusIcon, UploadIcon } from "@/components/icons";

const SAMPLE_URL = "/sample/sample-rental-agreement.pdf";
const SAMPLE_NAME = "Sample Rental Agreement.pdf";

const SUGGESTIONS = [
  "Summarise the key points",
  "What dates and deadlines are mentioned?",
  "What are the payment terms?",
  "What happens if the agreement is ended early?",
];

export default function Home() {
  // Documents
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<{ message: string; code: string } | null>(null);

  // Bring-your-own AI key (optional)
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [aiRemembered, setAiRemembered] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Conversation
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // UI
  const [evidence, setEvidence] = useState<{ messageId: string; n: number } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const fileInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // ---------- Toasts ----------
  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = uid();
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // ---------- Documents ----------
  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    setDocsError(null);
    try {
      setDocuments(await listDocuments());
    } catch (err) {
      setDocsError({
        message: err instanceof Error ? err.message : "Your library couldn't be opened.",
        code: "storage",
      });
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDocs();
    setMessages(loadConversation());
    const saved = loadAiSettings();
    setAi(saved.settings);
    setAiRemembered(saved.remembered);
  }, [loadDocs]);

  function connectAi(settings: AiSettings, remember: boolean) {
    saveAiSettings(settings, remember);
    setAi(settings);
    setAiRemembered(remember);
    setConnectOpen(false);
    toast("ok", `${providerName(settings.provider)} connected. Answers will now be written for you.`);
    composerRef.current?.focus();
  }

  function disconnectAi() {
    saveAiSettings(null, false);
    setAi(null);
    setConnectOpen(false);
    toast("ok", "AI disconnected. Your key was removed from this browser.");
  }

  const addFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
      const skipped = files.length - pdfs.length;
      if (skipped > 0) toast("error", `${skipped} file${skipped > 1 ? "s were" : " was"} skipped. Only PDFs can be added.`);
      if (pdfs.length === 0) return;

      const items = pdfs.map((f) => ({ id: uid(), name: f.name, state: "indexing" as const }));
      setUploads((u) => [...u, ...items]);
      setLibraryOpen(true);

      for (let i = 0; i < pdfs.length; i++) {
        const item = items[i];
        try {
          const doc = await addDocument(pdfs[i]);
          setUploads((u) => u.filter((x) => x.id !== item.id));
          setDocuments((d) => [doc, ...d.filter((x) => x.id !== doc.id)]);
          toast("ok", `${doc.name} is ready. ${doc.page_count} pages indexed.`);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed.";
          setUploads((u) => u.map((x) => (x.id === item.id ? { ...x, state: "failed", error: message } : x)));
        }
      }
      composerRef.current?.focus();
    },
    [toast]
  );

  async function addSample() {
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      await addFiles([new File([blob], SAMPLE_NAME, { type: "application/pdf" })]);
    } catch {
      toast("error", "The sample document couldn't be loaded.");
    }
  }

  async function removeDocument(doc: DocumentInfo) {
    const before = documents;
    setDocuments((d) => d.filter((x) => x.id !== doc.id));
    setSelected((s) => {
      const next = new Set(s);
      next.delete(doc.id);
      return next;
    });
    try {
      await deleteDocument(doc.id);
      toast("ok", `${doc.name} deleted.`);
    } catch (err) {
      setDocuments(before);
      toast("error", err instanceof Error ? err.message : "Couldn't delete the document.");
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---------- Asking ----------
  const updateAssistant = useCallback((id: string, patch: (m: AssistantMessage) => AssistantMessage) => {
    setMessages((all) => all.map((m) => (m.id === id && m.role === "assistant" ? patch(m) : m)));
  }, []);

  const ask = useCallback(
    async (text: string, base: Message[]) => {
      const q = text.trim();
      if (!q || streaming) return;

      const userMsg: Message = { id: uid(), role: "user", content: q };
      const assistant: AssistantMessage = {
        id: uid(),
        role: "assistant",
        mode: ai ? "ai" : "passages",
        content: "",
        sources: [],
        status: "searching",
        model: ai?.model,
      };
      // Earlier written answers give follow-up questions their context
      const history = base
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.mode === "ai" && m.status === "done"))
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-6);

      setMessages([...base, userMsg, assistant]);
      setQuestion("");
      setStreaming(true);
      setAtBottom(true);
      setEvidence(null);

      const controller = new AbortController();
      abortRef.current = controller;

      // Buffer streamed text and paint once per frame for smooth rendering
      let buffer = "";
      let frame = 0;
      const flush = () => {
        frame = 0;
        if (!buffer) return;
        const chunk = buffer;
        buffer = "";
        updateAssistant(assistant.id, (m) => ({ ...m, content: m.content + chunk }));
      };

      try {
        // 1. Search this browser's library (free, no key)
        const sources = await findPassages(q, [...selected], ai ? SEARCH.topK : SEARCH.passagesWithoutAi);
        updateAssistant(assistant.id, (m) => ({ ...m, sources }));

        // 2. No AI connected, or nothing matched: show the passages themselves
        if (!ai || sources.length === 0) {
          updateAssistant(assistant.id, (m) => ({ ...m, mode: "passages", status: "done" }));
          return;
        }

        // 3. Ask the visitor's own AI, streaming the answer
        updateAssistant(assistant.id, (m) => ({ ...m, status: "writing" }));
        const messagesForAi = [
          ...history,
          { role: "user" as const, content: `Context:\n${buildContext(sources)}\n\nQuestion: ${q}` },
        ];
        for await (const text of streamAnswer(ai, SYSTEM_PROMPT, messagesForAi, controller.signal)) {
          buffer += text;
          if (!frame) frame = requestAnimationFrame(flush);
        }
        cancelAnimationFrame(frame);
        flush();
        updateAssistant(assistant.id, (m) => ({ ...m, status: "done" }));
      } catch (err) {
        cancelAnimationFrame(frame);
        flush();
        if (controller.signal.aborted) {
          updateAssistant(assistant.id, (m) => ({ ...m, status: "stopped" }));
        } else {
          console.error(err);
          const message =
            err instanceof ProviderError || err instanceof LibraryError
              ? err.message
              : "The answer couldn't be generated. Try again.";
          updateAssistant(assistant.id, (m) => ({ ...m, status: "error", error: message }));
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [ai, selected, streaming, updateAssistant]
  );

  function stop() {
    abortRef.current?.abort();
  }

  function retry(assistantId: string) {
    const index = messages.findIndex((m) => m.id === assistantId);
    const userMsg = messages[index - 1];
    if (!userMsg || userMsg.role !== "user") return;
    // If it's the latest answer, replace it; otherwise ask again at the end
    const isLast = index === messages.length - 1;
    ask(userMsg.content, isLast ? messages.slice(0, index - 1) : messages);
  }

  function newChat() {
    stop();
    setMessages([]);
    setEvidence(null);
    composerRef.current?.focus();
  }

  // Save the conversation whenever an answer settles
  useEffect(() => {
    if (!streaming) saveConversation(messages);
  }, [messages, streaming]);

  // ---------- Scrolling ----------
  useEffect(() => {
    if (atBottom) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, atBottom]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  // ---------- Drag and drop anywhere ----------
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      addFiles(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [addFiles]);

  // ---------- Keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement).tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        composerRef.current?.focus();
      } else if (e.key === "Escape") {
        if (evidence) setEvidence(null);
        else if (libraryOpen) setLibraryOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [evidence, libraryOpen]);

  // ---------- Derived ----------
  const evidenceData = useMemo(() => {
    if (!evidence) return null;
    const index = messages.findIndex((m) => m.id === evidence.messageId);
    const msg = messages[index];
    if (!msg || msg.role !== "assistant") return null;
    const cited = citedNumbers(msg.content);
    const sources = msg.sources.filter((s) => cited.has(s.n));
    const prev = messages[index - 1];
    return {
      sources: sources.length ? sources : msg.sources,
      terms: prev?.role === "user" ? keyTerms(prev.content) : [],
    };
  }, [evidence, messages]);

  const hasDocs = documents.length > 0;
  const firstQuestion = messages.find((m) => m.role === "user")?.content;
  const showOnboarding = !docsLoading && !docsError && !hasDocs && uploads.length === 0 && messages.length === 0;

  const scopeLabel =
    selected.size === 0
      ? hasDocs
        ? documents.length === 1
          ? `Searching ${documents[0].name.replace(/\.pdf$/i, "")}`
          : `Searching all ${documents.length} documents`
        : "No documents yet"
      : selected.size === 1
        ? `Searching ${documents.find((d) => selected.has(d.id))?.name.replace(/\.pdf$/i, "") ?? "1 document"}`
        : `Searching ${selected.size} selected documents`;

  const library = (
    <Library
      documents={documents}
      loading={docsLoading}
      loadError={docsError ? "Library unavailable." : null}
      uploads={uploads}
      selected={selected}
      onToggle={toggle}
      onClearSelection={() => setSelected(new Set())}
      onDelete={removeDocument}
      onPickFiles={() => fileInput.current?.click()}
      onDismissUpload={(id) => setUploads((u) => u.filter((x) => x.id !== id))}
      onRetryLoad={loadDocs}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {/* Library: fixed column on desktop, drawer on mobile */}
      <aside className="hidden w-[280px] shrink-0 border-r border-rule bg-paper md:block" aria-label="Library">
        {library}
      </aside>

      {libraryOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Library">
          <button className="absolute inset-0 bg-ink/30" onClick={() => setLibraryOpen(false)} aria-label="Close library" />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] bg-paper shadow-lift">
            <button
              onClick={() => setLibraryOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-[18px] text-slate hover:bg-sunken"
              aria-label="Close library"
            >
              <CloseIcon />
            </button>
            {library}
          </div>
        </div>
      )}

      {/* Conversation */}
      <main className="relative flex min-w-0 flex-1 flex-col bg-surface">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-rule px-3 md:px-6">
          <button
            onClick={() => setLibraryOpen(true)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[14px] font-medium hover:bg-sunken md:hidden"
          >
            <MenuIcon className="text-[18px]" />
            Library
            {hasDocs && <span className="rounded-full bg-sunken px-1.5 text-[12px] text-slate">{documents.length}</span>}
          </button>
          <p className="hidden min-w-0 truncate text-[14px] font-medium md:block">
            {firstQuestion ?? <span className="font-normal text-slate">New conversation</span>}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={newChat}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium hover:bg-sunken"
                aria-label="New chat"
              >
                <PlusIcon className="text-[16px]" />
                <span className="hidden sm:inline">New chat</span>
              </button>
            )}
            <button
              onClick={() => setConnectOpen(true)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                ai ? "border-rule hover:bg-sunken" : "border-action text-action hover:bg-action-soft"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${ai ? "bg-ok" : "bg-rule"}`}
                aria-hidden="true"
              />
              {ai ? providerName(ai.provider) : "Connect AI"}
            </button>
          </div>
        </header>

        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-4 pb-8 pt-8 md:px-6">
            {docsError && !hasDocs && messages.length === 0 && (
              <Unavailable error={docsError} onRetry={loadDocs} retrying={docsLoading} />
            )}

            {showOnboarding && <Onboarding onPick={() => fileInput.current?.click()} onSample={addSample} />}

            {!showOnboarding && !docsError && !docsLoading && (hasDocs || uploads.length > 0) && messages.length === 0 && (
              <div className="pt-[12vh]">
                <h1 className="text-[26px] font-semibold tracking-tight">What do you want to find out?</h1>
                <p className="mt-1.5 text-slate">
                  {hasDocs
                    ? "Ask in plain language. Every answer links to the passage it came from."
                    : "Your PDFs are being indexed. You can ask as soon as they're ready."}
                </p>
                {hasDocs && (
                  <div className="mt-6 flex flex-col items-start gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => ask(s, messages)}
                        className="rounded-lg border border-rule px-3.5 py-2 text-left text-[14px] transition hover:border-action hover:bg-action-soft"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Conversation
              messages={messages}
              activeCitation={evidence}
              onCite={(messageId, n) => setEvidence({ messageId, n })}
              onRetry={retry}
              onConnect={() => setConnectOpen(true)}
            />
          </div>
        </div>

        {!atBottom && messages.length > 0 && (
          <button
            onClick={() => {
              setAtBottom(true);
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
            }}
            className="absolute bottom-36 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-[13px] shadow-lift hover:bg-sunken"
          >
            <ArrowDownIcon />
            Latest
          </button>
        )}

        <div className="shrink-0 px-3 pb-3 pt-1 md:px-6 md:pb-5">
          <div className="mx-auto max-w-[720px]">
            <Composer
              ref={composerRef}
              value={question}
              onChange={setQuestion}
              onSubmit={() => ask(question, messages)}
              onStop={stop}
              streaming={streaming}
              disabled={!hasDocs}
              scopeLabel={scopeLabel}
              maxLength={LIMITS.maxQuestionLength}
            />
            <p className="mt-2 hidden text-center text-[12px] text-slate md:block">
              Answers come only from your documents. Check the evidence before relying on them.
            </p>
          </div>
        </div>
      </main>

      {/* Evidence: side rail on large screens, bottom sheet elsewhere */}
      {evidence && evidenceData && (
        <>
          <aside className="hidden w-[380px] shrink-0 border-l border-rule bg-paper xl:block" aria-label="Evidence">
            <EvidencePanel
              sources={evidenceData.sources}
              activeN={evidence.n}
              terms={evidenceData.terms}
              onSelect={(n) => setEvidence({ ...evidence, n })}
              onClose={() => setEvidence(null)}
            />
          </aside>
          <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-modal="true" aria-label="Evidence">
            <button className="absolute inset-0 bg-ink/30" onClick={() => setEvidence(null)} aria-label="Close evidence" />
            <div className="sheet-enter absolute inset-x-0 bottom-0 max-h-[78dvh] rounded-t-2xl bg-paper shadow-lift md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-[400px] md:rounded-none">
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule md:hidden" aria-hidden="true" />
              <div className="h-[calc(78dvh-12px)] md:h-full">
                <EvidencePanel
                  sources={evidenceData.sources}
                  activeN={evidence.n}
                  terms={evidenceData.terms}
                  onSelect={(n) => setEvidence({ ...evidence, n })}
                  onClose={() => setEvidence(null)}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-action/10 p-6 backdrop-blur-[2px]">
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-action bg-surface px-10 py-8 text-center shadow-lift">
            <UploadIcon className="text-[28px] text-action" />
            <p className="mt-2 text-[17px] font-semibold">Drop PDFs to add them</p>
            <p className="text-[13px] text-slate">Up to {LIMITS.maxFileSizeMb} MB each</p>
          </div>
        </div>
      )}

      {connectOpen && (
        <ConnectAI
          current={ai}
          remembered={aiRemembered}
          onSave={connectAi}
          onDisconnect={disconnectAi}
          onClose={() => setConnectOpen(false)}
        />
      )}

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}

// Shown when the library can't load: says what happened in plain words and offers a retry
function Unavailable({
  error,
  onRetry,
  retrying,
}: {
  error: { message: string; code: string };
  onRetry: () => void;
  retrying: boolean;
}) {
  const notReady = error.code === "not_configured";
  return (
    <section className="pt-[12vh]" role="alert">
      <h1 className="text-[26px] font-semibold tracking-tight">
        {notReady ? "PageProof is almost ready" : error.code === "offline" ? "You're offline" : "Your library didn't load"}
      </h1>
      <p className="mt-2 max-w-[52ch] text-slate">{error.message}</p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="mt-6 rounded-xl border border-rule px-5 py-2.5 font-medium transition hover:border-action hover:bg-action-soft disabled:opacity-50"
      >
        {retrying ? "Checking" : "Try again"}
      </button>
    </section>
  );
}

function Onboarding({ onPick, onSample }: { onPick: () => void; onSample: () => void }) {
  return (
    <section className="pt-[8vh]">
      <h1 className="max-w-[16ch] text-[34px] font-semibold leading-[1.15] tracking-tight md:text-[40px]">
        Ask your PDFs. <span className="mark">Check every answer.</span>
      </h1>
      <p className="mt-4 max-w-[52ch] text-[16px] text-slate">
        Add a contract, manual or report and ask questions in plain language. Each answer points to the page it came
        from, so you never have to take it on trust.
      </p>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onPick}
          className="flex items-center justify-center gap-2 rounded-xl bg-action px-5 py-3 font-medium text-action-ink transition hover:opacity-90"
        >
          <UploadIcon className="text-[17px]" />
          Choose PDFs
        </button>
        <button
          onClick={onSample}
          className="rounded-xl border border-rule px-5 py-3 font-medium transition hover:border-action hover:bg-action-soft"
        >
          Try a sample rental agreement
        </button>
      </div>
      <p className="mt-3 text-[13px] text-slate">
        No sign-up. Your files stay in this browser and are never uploaded to PageProof.
      </p>

      <ol className="mt-12 grid gap-5 border-t border-rule pt-6 sm:grid-cols-3">
        {[
          ["Add documents", `PDFs with selectable text, up to ${LIMITS.maxFileSizeMb} MB each.`],
          ["Ask a question", "Get the exact passages free. Connect your own AI for written answers."],
          ["Check the source", "Tap a highlighted number to read the passage and page."],
        ].map(([title, body], i) => (
          <li key={title}>
            <p className="text-[13px] text-slate">Step {i + 1}</p>
            <p className="mt-0.5 font-medium">{title}</p>
            <p className="mt-1 text-[14px] text-slate">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
