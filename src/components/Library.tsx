"use client";

import { useState } from "react";
import type { DocumentInfo } from "@/lib/types";
import { formatPages } from "@/lib/client";
import { AlertIcon, CloseIcon, DocIcon, SearchIcon, TrashIcon, UploadIcon } from "./icons";

export type UploadItem = {
  id: string;
  name: string;
  state: "indexing" | "failed";
  error?: string;
};

type Props = {
  documents: DocumentInfo[];
  loading: boolean;
  loadError: string | null;
  uploads: UploadItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onClearSelection: () => void;
  onDelete: (doc: DocumentInfo) => void;
  onPickFiles: () => void;
  onDismissUpload: (id: string) => void;
  onRetryLoad: () => void;
};

export function Library({
  documents,
  loading,
  loadError,
  uploads,
  selected,
  onToggle,
  onClearSelection,
  onDelete,
  onPickFiles,
  onDismissUpload,
  onRetryLoad,
}: Props) {
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const visible = query
    ? documents.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
    : documents;

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-5">
        <p className="text-[17px] font-semibold tracking-tight">Document Chat</p>
        <p className="text-[13px] text-slate">Answers you can check, page by page.</p>
      </div>

      <div className="px-4">
        <button
          onClick={onPickFiles}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-action px-3 py-2.5 text-[14px] font-medium text-action-ink transition hover:opacity-90"
        >
          <UploadIcon className="text-[16px]" />
          Add PDFs
        </button>
        <p className="mt-1.5 text-center text-[12px] text-slate">or drop files anywhere</p>
      </div>

      {/* Upload queue */}
      {uploads.length > 0 && (
        <ul className="mt-4 space-y-2 px-4" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.id} className="rounded-lg border border-rule bg-surface px-3 py-2.5">
              <div className="flex items-start gap-2">
                {u.state === "failed" ? (
                  <AlertIcon className="mt-0.5 shrink-0 text-[15px] text-danger" />
                ) : (
                  <DocIcon className="mt-0.5 shrink-0 text-[15px] text-slate" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium" title={u.name}>
                    {u.name}
                  </p>
                  {u.state === "indexing" ? (
                    <>
                      <p className="text-[12px] text-slate">Reading and indexing pages</p>
                      <div className="progress mt-2" role="progressbar" aria-label={`Indexing ${u.name}`} />
                    </>
                  ) : (
                    <p className="text-[12px] text-danger">{u.error}</p>
                  )}
                </div>
                {u.state === "failed" && (
                  <button
                    onClick={() => onDismissUpload(u.id)}
                    className="rounded p-0.5 text-slate hover:text-ink"
                    aria-label={`Dismiss ${u.name}`}
                  >
                    <CloseIcon className="text-[14px]" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Document list */}
      <div className="mt-5 flex items-center justify-between px-4">
        <p className="text-[13px] font-medium text-slate">
          Library{documents.length > 0 && ` (${documents.length})`}
        </p>
        {selected.size > 0 && (
          <button onClick={onClearSelection} className="text-[12px] text-action hover:underline">
            Ask all instead
          </button>
        )}
      </div>

      {documents.length > 5 && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-md border border-rule bg-surface px-2.5">
          <SearchIcon className="text-[14px] text-slate" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter documents"
            className="w-full bg-transparent py-1.5 text-[13px] outline-none placeholder:text-slate"
            aria-label="Filter documents"
          />
        </div>
      )}

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {loading && (
          <div className="space-y-2 px-2 pt-1" aria-label="Loading documents">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-sunken" />
            ))}
          </div>
        )}

        {!loading && loadError && (
          <div className="mx-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
            <p>{loadError}</p>
            <button onClick={onRetryLoad} className="mt-1 font-medium underline">
              Try again
            </button>
          </div>
        )}

        {!loading && !loadError && documents.length === 0 && (
          <p className="px-2 text-[13px] text-slate">Your PDFs will appear here.</p>
        )}

        <ul className="space-y-0.5">
          {visible.map((d) => {
            const isSelected = selected.has(d.id);
            const isConfirming = confirming === d.id;
            return (
              <li key={d.id}>
                {isConfirming ? (
                  <div className="rounded-md bg-danger-soft px-3 py-2 text-[13px]">
                    <p className="truncate">
                      Delete <span className="font-medium">{d.name}</span>?
                    </p>
                    <div className="mt-1.5 flex gap-3">
                      <button
                        onClick={() => {
                          setConfirming(null);
                          onDelete(d);
                        }}
                        className="font-medium text-danger hover:underline"
                        autoFocus
                      >
                        Delete
                      </button>
                      <button onClick={() => setConfirming(null)} className="text-slate hover:underline">
                        Keep
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`group flex items-center gap-2.5 rounded-md px-2 py-2 transition ${
                      isSelected ? "bg-action-soft" : "hover:bg-sunken"
                    }`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggle(d.id)}
                        className="h-4 w-4 shrink-0 accent-[var(--action)]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium" title={d.name}>
                          {d.name.replace(/\.pdf$/i, "")}
                        </span>
                        <span className="block text-[12px] text-slate">{formatPages(d.page_count)}</span>
                      </span>
                    </label>
                    <button
                      onClick={() => setConfirming(d.id)}
                      className="rounded p-1 text-slate opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
                      aria-label={`Delete ${d.name}`}
                    >
                      <TrashIcon className="text-[15px]" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {query && visible.length === 0 && (
          <p className="px-2 pt-2 text-[13px] text-slate">No documents match “{query}”.</p>
        )}
      </div>

      <p className="border-t border-rule px-4 py-3 text-[12px] text-slate">
        Tick documents to limit answers to them.
      </p>
    </div>
  );
}
