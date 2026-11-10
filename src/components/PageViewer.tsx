"use client";

import { useEffect, useRef, useState } from "react";
import { getDocumentFile, openPdf } from "@/lib/library";
import { CloseIcon } from "./icons";

type Box = { left: number; top: number; width: number; height: number };

type Props = {
  documentId: string;
  documentName: string;
  page: number;
  pageCount: number;
  // Text to find and highlight on the page (a cited sentence, or a key fact with its sentence)
  highlight: string;
  onClose: () => void;
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Shows the real PDF page with the matching lines highlighted.
export function PageViewer({ documentId, documentName, page: startPage, pageCount, highlight, onClose }: Props) {
  const [page, setPage] = useState(startPage);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const firstBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;

    (async () => {
      setStatus("loading");
      setBoxes([]);
      try {
        const bytes = await getDocumentFile(documentId);
        if (!bytes) {
          if (!cancelled) setStatus("missing");
          return;
        }
        const pdf = await openPdf(bytes);
        const pdfPage = await pdf.getPage(page);
        const frameWidth = frameRef.current?.clientWidth || 600;
        const base = pdfPage.getViewport({ scale: 1 });
        const cssScale = frameWidth / base.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: cssScale * dpr });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        setSize({ width: viewport.width / dpr, height: viewport.height / dpr });

        task = pdfPage.render({ canvas, viewport });
        await task.promise;

        // Highlight text lines that belong to the target sentence
        const target = norm(highlight);
        const found: Box[] = [];
        if (target) {
          const content = await pdfPage.getTextContent();
          for (const item of content.items) {
            if (!("str" in item)) continue;
            const text = norm(item.str);
            if (text.length < 4 || !target.includes(text)) continue;
            const [, , , , x, y] = item.transform as number[];
            const h = item.height || Math.abs((item.transform as number[])[3]);
            const [x1, y1] = viewport.convertToViewportPoint(x, y);
            const [x2, y2] = viewport.convertToViewportPoint(x + item.width, y + h);
            found.push({
              left: Math.min(x1, x2) / dpr - 2,
              top: Math.min(y1, y2) / dpr - 2,
              width: Math.abs(x2 - x1) / dpr + 4,
              height: Math.abs(y2 - y1) / dpr + 4,
            });
          }
        }
        if (!cancelled) {
          setBoxes(found);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled && (err as Error)?.name !== "RenderingCancelledException") {
          console.error(err);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [documentId, page, highlight]);

  useEffect(() => {
    if (status === "ready") firstBox.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [status, boxes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && page < pageCount) setPage((p) => p + 1);
      else if (e.key === "ArrowLeft" && page > 1) setPage((p) => p - 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [page, pageCount]);

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center md:p-6" role="dialog" aria-modal="true" aria-label={`${documentName}, page ${page}`}>
      <button className="absolute inset-0 bg-ink/50" onClick={onClose} aria-label="Close page" />
      <div className="sheet-enter relative flex w-full max-w-[860px] flex-col overflow-hidden bg-paper shadow-lift md:rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-rule bg-surface px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold">{documentName.replace(/\.pdf$/i, "")}</h2>
            <p className="text-[12px] text-slate">
              {boxes.length > 0 && page === startPage ? "Matching lines highlighted" : `Page ${page} of ${pageCount}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-rule px-2.5 py-1.5 text-[13px] hover:bg-sunken disabled:opacity-40"
              aria-label="Previous page"
            >
              Prev
            </button>
            <span className="px-2 text-[13px] tabular-nums text-slate">
              {page} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="rounded-md border border-rule px-2.5 py-1.5 text-[13px] hover:bg-sunken disabled:opacity-40"
              aria-label="Next page"
            >
              Next
            </button>
            <button onClick={onClose} className="ml-1 rounded-md p-1.5 text-[18px] text-slate hover:bg-sunken" aria-label="Close page">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
          <div ref={frameRef} className="mx-auto w-full max-w-[780px]">
            {status === "missing" && (
              <p className="rounded-lg bg-sunken p-4 text-[14px] text-slate">
                The original page isn&apos;t stored for this document (it was added before page view existed, or the
                browser was short of space). Delete it and add it again to see its pages.
              </p>
            )}
            {status === "error" && (
              <p className="rounded-lg bg-danger-soft p-4 text-[14px] text-danger">This page couldn&apos;t be displayed.</p>
            )}
            <div
              className={`relative mx-auto bg-white shadow-lift ${status === "missing" || status === "error" ? "hidden" : ""}`}
              style={size.width ? { width: size.width, height: size.height } : { aspectRatio: "1 / 1.414" }}
            >
              <canvas ref={canvasRef} className="block h-full w-full" />
              {boxes.map((b, i) => (
                <div
                  key={i}
                  ref={i === 0 ? firstBox : undefined}
                  className="pointer-events-none absolute rounded-[3px] bg-[#ffe45c]/55 mix-blend-multiply ring-2 ring-[#e8c93a]"
                  style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
                  aria-hidden="true"
                />
              ))}
              {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-[14px] text-slate">Loading page</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
