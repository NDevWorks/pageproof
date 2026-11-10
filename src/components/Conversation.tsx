"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AssistantMessage, Message } from "@/lib/client";
import { bestSnippet, citedNumbers, keyTerms } from "@/lib/client";
import type { Source } from "@/lib/types";
import { Highlighted } from "./EvidencePanel";
import { AlertIcon, CheckIcon, CopyIcon, RetryIcon } from "./icons";

type Props = {
  messages: Message[];
  activeCitation: { messageId: string; n: number } | null;
  onCite: (messageId: string, n: number) => void;
  onRetry: (assistantId: string) => void;
  onConnect: () => void;
};

export function Conversation({ messages, activeCitation, onCite, onRetry, onConnect }: Props) {
  return (
    <ol className="space-y-8" aria-label="Conversation">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <li key={m.id} className="flex justify-end">
            <div className="max-w-[85%]">
              <p className="sr-only">You asked:</p>
              <p className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-sunken px-4 py-2.5">
                {m.content}
              </p>
            </div>
          </li>
        ) : (
          <li key={m.id}>
            <Answer
              message={m}
              terms={(() => {
                const prev = messages[i - 1];
                return prev?.role === "user" ? keyTerms(prev.content) : [];
              })()}
              activeN={activeCitation?.messageId === m.id ? activeCitation.n : null}
              onCite={(n) => onCite(m.id, n)}
              onRetry={() => onRetry(m.id)}
              onConnect={onConnect}
            />
          </li>
        )
      )}
    </ol>
  );
}

function Answer({
  message,
  terms,
  activeN,
  onCite,
  onRetry,
  onConnect,
}: {
  message: AssistantMessage;
  terms: string[];
  activeN: number | null;
  onCite: (n: number) => void;
  onRetry: () => void;
  onConnect: () => void;
}) {
  const { content, status, sources, error } = message;
  const streaming = status === "searching" || status === "writing";

  if (message.mode === "passages" && !streaming && status !== "error") {
    return (
      <article>
        <p className="sr-only">Matching passages:</p>
        <PassageResults sources={sources} terms={terms} activeN={activeN} onCite={onCite} onConnect={onConnect} />
      </article>
    );
  }
  const cited = citedNumbers(content);
  const usedSources = sources.filter((s) => cited.has(s.n));

  return (
    <article aria-busy={streaming}>
      <p className="sr-only">Answer:</p>

      {status === "searching" && <Stage text="Searching your documents" />}
      {status === "writing" && !content && <Stage text="Generating an answer" />}

      {content && (
        <div>
          {/* Announce the finished answer once, not every streamed word */}
          <p className="sr-only" aria-live="polite">
            {status === "done" ? content.replace(/\[\d+\]/g, "") : ""}
          </p>
          <MarkdownAnswer
            content={streaming ? content.trimEnd() + " [](#caret)" : content}
            sources={sources}
            activeN={activeN}
            onCite={onCite}
          />
        </div>
      )}

      {status === "stopped" && (
        <p className="mt-2 text-[13px] text-slate">Stopped before the answer finished.</p>
      )}

      {status === "error" && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-[14px] text-danger" role="alert">
          <AlertIcon className="mt-0.5 shrink-0 text-[16px]" />
          <div>
            <p>{error || "The answer couldn't be generated."}</p>
            <button onClick={onRetry} className="mt-1 font-medium underline">
              Try again
            </button>
          </div>
        </div>
      )}

      {!streaming && usedSources.length > 0 && (
        <SourceStrip sources={usedSources} activeN={activeN} onCite={onCite} />
      )}

      {!streaming && status !== "error" && content && <Actions content={content} onRetry={onRetry} />}
    </article>
  );
}

// No AI connected: show the best passages directly, with the question's words highlighted
function PassageResults({
  sources,
  terms,
  activeN,
  onCite,
  onConnect,
}: {
  sources: Source[];
  terms: string[];
  activeN: number | null;
  onCite: (n: number) => void;
  onConnect: () => void;
}) {
  if (sources.length === 0) {
    return (
      <p className="text-slate">
        No passages matched those words. Try the words the document itself would use, or check the right documents are
        ticked.
      </p>
    );
  }
  return (
    <div>
      <p className="text-[14px] text-slate">
        Best matching passage{sources.length === 1 ? "" : "s"} in your documents:
      </p>
      <ol className="mt-3 space-y-3">
        {sources.map((s) => (
          <li key={s.n}>
            <button
              onClick={() => onCite(s.n)}
              className={`block w-full rounded-xl border bg-surface p-4 text-left transition ${
                activeN === s.n ? "border-action shadow-lift" : "border-rule hover:border-slate"
              }`}
            >
              <span className="flex items-baseline gap-2">
                <span className="mark shrink-0 text-[12px] font-semibold tabular-nums">{s.n}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {s.documentName.replace(/\.pdf$/i, "")}
                </span>
                <span className="shrink-0 text-[12px] text-slate">page {s.page}</span>
              </span>
              <span className="mt-2 block font-serif text-[14.5px] leading-[1.7]">
                <Highlighted text={bestSnippet(s.excerpt, terms)} terms={terms} />
              </span>
              <span className="mt-2 block text-[12px] text-action">Read the full passage</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[13px] text-slate">
        Want a written answer too?{" "}
        <button onClick={onConnect} className="font-medium text-action hover:underline">
          Connect your AI
        </button>{" "}
        (free options available).
      </p>
    </div>
  );
}

function Stage({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2.5 text-[14px] text-slate" role="status">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-action"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      {text}
    </p>
  );
}

// Turn [n] markers into links the renderer can recognise as citations
function withCitationLinks(text: string) {
  return text.replace(/\[(\d+)\](?!\()/g, "[$1](#cite-$1)");
}

const MarkdownAnswer = memo(function MarkdownAnswer({
  content,
  sources,
  activeN,
  onCite,
}: {
  content: string;
  sources: Source[];
  activeN: number | null;
  onCite: (n: number) => void;
}) {
  return (
    <div className="answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            if (href === "#caret") return <span className="caret" aria-hidden="true" />;
            const match = href?.match(/^#cite-(\d+)$/);
            if (match) {
              const n = Number(match[1]);
              const source = sources.find((s) => s.n === n);
              if (!source) return <>{children}</>;
              return (
                <button
                  type="button"
                  onClick={() => onCite(n)}
                  className={`mark mx-[1px] align-baseline text-[0.8em] font-semibold tabular-nums transition hover:brightness-95 ${
                    activeN === n ? "ring-2 ring-action" : ""
                  }`}
                  aria-label={`Source ${n}: ${source.documentName}, page ${source.page}`}
                  title={`${source.documentName}, page ${source.page}`}
                >
                  {n}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-action underline">
                {children}
              </a>
            );
          },
        }}
      >
        {withCitationLinks(content)}
      </ReactMarkdown>
    </div>
  );
});

function SourceStrip({
  sources,
  activeN,
  onCite,
}: {
  sources: Source[];
  activeN: number | null;
  onCite: (n: number) => void;
}) {
  // Group pages by document: "Rental Agreement: p. 2, 3, 4"
  const byDoc = new Map<string, Source[]>();
  for (const s of sources) byDoc.set(s.documentName, [...(byDoc.get(s.documentName) ?? []), s]);

  return (
    <div className="mt-4 space-y-1.5 border-l-2 border-mark pl-3">
      {[...byDoc.entries()].map(([doc, items]) => (
        <p key={doc} className="text-[13px] text-slate">
          <span className="font-medium text-ink">{doc.replace(/\.pdf$/i, "")}</span>
          <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
            {items.map((s) => (
              <button
                key={s.n}
                onClick={() => onCite(s.n)}
                className={`rounded px-1.5 py-0.5 text-[12px] transition ${
                  activeN === s.n ? "bg-mark text-mark-ink" : "bg-sunken hover:bg-mark hover:text-mark-ink"
                }`}
                aria-label={`Open source ${s.n}, page ${s.page}`}
              >
                <span className="font-semibold tabular-nums">{s.n}</span>
                <span className="ml-1 opacity-80">p. {s.page}</span>
              </button>
            ))}
          </span>
        </p>
      ))}
    </div>
  );
}

function Actions({ content, onRetry }: { content: string; onRetry: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content.replace(/\[(\d+)\]/g, "[$1]"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked; nothing else to do
    }
  }

  return (
    <div className="mt-3 flex gap-1 text-[13px] text-slate">
      <button onClick={copy} className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-sunken hover:text-ink">
        {copied ? <CheckIcon className="text-ok" /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button onClick={onRetry} className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-sunken hover:text-ink">
        <RetryIcon />
        Ask again
      </button>
    </div>
  );
}
