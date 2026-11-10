"use client";

import { useEffect, useMemo, useState } from "react";
import { FACT_LABELS, extractFacts, type Fact, type FactKind } from "@/lib/facts";
import { getChunks } from "@/lib/library";
import type { DocumentInfo } from "@/lib/types";
import { CloseIcon } from "./icons";

type Props = {
  document: DocumentInfo;
  onOpenPage: (fact: Fact) => void;
  onAsk: (question: string) => void;
  onClose: () => void;
};

const ORDER: FactKind[] = ["date", "money", "period", "percent"];

export function KeyFacts({ document, onOpenPage, onAsk, onClose }: Props) {
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [kind, setKind] = useState<FactKind | "all">("all");

  useEffect(() => {
    let live = true;
    getChunks(document.id)
      .then((chunks) => live && setFacts(extractFacts(chunks)))
      .catch(() => live && setFacts([]));
    return () => {
      live = false;
    };
  }, [document.id]);


  const counts = useMemo(() => {
    const c: Partial<Record<FactKind, number>> = {};
    for (const f of facts ?? []) c[f.kind] = (c[f.kind] ?? 0) + 1;
    return c;
  }, [facts]);

  const shown = (facts ?? []).filter((f) => kind === "all" || f.kind === kind);
  const name = document.name.replace(/\.pdf$/i, "");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="facts-title">
      <button className="absolute inset-0 bg-ink/40" onClick={onClose} aria-label="Close key facts" />
      <div className="sheet-enter relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-paper shadow-lift md:max-w-[680px] md:rounded-2xl">
        <header className="border-b border-rule px-5 pb-3 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="facts-title" className="text-[18px] font-semibold">Key facts</h2>
              <p className="truncate text-[13px] text-slate">{name}</p>
            </div>
            <button onClick={onClose} className="rounded-md p-1.5 text-[18px] text-slate hover:bg-sunken" aria-label="Close key facts">
              <CloseIcon />
            </button>
          </div>

          {facts && facts.length > 0 && (
            <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Kind of fact">
              {(["all", ...ORDER.filter((k) => counts[k])] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={kind === k}
                  onClick={() => setKind(k)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[13px] transition ${
                    kind === k ? "bg-ink text-paper" : "bg-sunken text-ink hover:bg-rule"
                  }`}
                >
                  {k === "all" ? "All" : FACT_LABELS[k]}{" "}
                  <span className="tabular-nums opacity-70">{k === "all" ? facts.length : counts[k]}</span>
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {facts === null && <p className="text-[14px] text-slate">Reading the document</p>}

          {facts && facts.length === 0 && (
            <p className="text-[14px] text-slate">
              No dates, amounts, percentages or time periods were found in this document.
            </p>
          )}

          <ol className="space-y-2.5">
            {shown.map((f, i) => (
              <li key={i} className="rounded-xl border border-rule bg-surface p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0">
                    <span className="mr-2 text-[11.5px] text-slate">{FACT_LABELS[f.kind].replace(/s$/, "")}</span>
                    <span className="mark text-[15px] font-semibold">{f.value}</span>
                  </p>
                  <button
                    onClick={() => onOpenPage(f)}
                    className="shrink-0 rounded-md bg-sunken px-2 py-1 text-[12px] hover:bg-mark hover:text-mark-ink"
                    aria-label={`Show ${f.value} on page ${f.page}`}
                  >
                    page {f.page}
                  </button>
                </div>
                <p className="mt-2 font-serif text-[14px] leading-[1.65] text-ink">{f.context}</p>
                <button
                  onClick={() => onAsk(`What does the document say about "${f.value}"? Explain what it means for me.`)}
                  className="mt-1.5 text-[12.5px] font-medium text-action hover:underline"
                >
                  Ask about this
                </button>
              </li>
            ))}
          </ol>
        </div>

        <p className="border-t border-rule px-5 py-2.5 text-[12px] text-slate">
          Found by pattern matching, so a few may be missed or not matter. Tap a page to check it.
        </p>
      </div>
    </div>
  );
}
