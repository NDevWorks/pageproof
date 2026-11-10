"use client";

import { AlertIcon, CheckIcon, CloseIcon } from "./icons";

export type Toast = { id: string; kind: "ok" | "error"; text: string };

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-6 md:top-5 md:items-end"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className="sheet-enter pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl border border-rule bg-surface px-4 py-2.5 text-[14px] text-ink shadow-lift"
        >
          {t.kind === "ok" ? (
            <CheckIcon className="shrink-0 text-[16px] text-ok" />
          ) : (
            <AlertIcon className="shrink-0 text-[16px] text-danger" />
          )}
          <span>{t.text}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-1 rounded p-0.5 text-slate hover:text-ink"
            aria-label="Dismiss"
          >
            <CloseIcon className="text-[14px]" />
          </button>
        </div>
      ))}
    </div>
  );
}
