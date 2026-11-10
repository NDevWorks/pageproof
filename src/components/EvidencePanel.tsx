"use client";

import { Fragment, useEffect, useRef } from "react";
import type { Source } from "@/lib/types";
import { bestSnippet, tidyPassage } from "@/lib/client";
import { CloseIcon, PageIcon } from "./icons";

type Props = {
  sources: Source[];
  activeN: number;
  terms: string[];
  onSelect: (n: number) => void;
  onClose: () => void;
  onViewPage: (source: Source) => void;
};

// Shows the passages behind an answer, with the question's key words highlighted.
export function EvidencePanel({ sources, activeN, terms, onSelect, onClose, onViewPage }: Props) {
  const activeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeN]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-semibold">Evidence</h2>
          <p className="text-[12px] text-slate">
            {sources.length} passage{sources.length === 1 ? "" : "s"} behind this answer
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-[18px] text-slate hover:bg-sunken hover:text-ink"
          aria-label="Close evidence"
        >
          <CloseIcon />
        </button>
      </div>

      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {sources.map((s) => {
          const active = s.n === activeN;
          return (
            <li key={s.n}>
              <article
                ref={active ? activeRef : undefined}
                onClick={() => onSelect(s.n)}
                className={`cursor-pointer rounded-xl border bg-surface p-4 transition ${
                  active ? "border-action shadow-lift" : "border-rule hover:border-slate"
                }`}
              >
                <header className="flex items-baseline gap-2">
                  <span className="mark shrink-0 text-[12px] font-semibold tabular-nums">{s.n}</span>
                  <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium" title={s.documentName}>
                    {s.documentName.replace(/\.pdf$/i, "")}
                  </h3>
                  <span className="shrink-0 text-[12px] text-slate">page {s.page}</span>
                </header>
                <blockquote className="mt-2.5 whitespace-pre-line font-serif text-[14px] leading-[1.7] text-ink">
                  <Highlighted text={active ? tidyPassage(s.excerpt) : bestSnippet(s.excerpt, terms, 220)} terms={terms} />
                </blockquote>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[11.5px] text-slate">
                    {s.similarity >= 0.99 ? "Best match" : `Relevance ${Math.round(s.similarity * 100)}% of best match`}
                    {!active && ". Tap to read in full."}
                  </p>
                  {active && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewPage(s);
                      }}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-action px-3 py-1.5 text-[12.5px] font-medium text-action-ink hover:opacity-90"
                    >
                      <PageIcon className="text-[14px]" />
                      See page {s.page}
                    </button>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="mark">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}
