"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { SendIcon, StopIcon } from "./icons";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled: boolean;
  scopeLabel: string;
  maxLength: number;
};

export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(
  { value, onChange, onSubmit, onStop, streaming, disabled, scopeLabel, maxLength },
  ref
) {
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => area.current as HTMLTextAreaElement);

  // Grow with the text, up to about 8 lines
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  const tooLong = value.length > maxLength;
  const canSend = !disabled && !streaming && value.trim().length > 0 && !tooLong;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      className="rounded-2xl border border-rule bg-surface shadow-lift transition focus-within:border-action focus-within:ring-2 focus-within:ring-action/20"
    >
      <label htmlFor="question" className="sr-only">
        Ask a question about your documents
      </label>
      <textarea
        id="question"
        ref={area}
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        placeholder={
          disabled
            ? "Add a PDF to start asking questions"
            : "Ask about dates, amounts, obligations, definitions…"
        }
        className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] outline-none placeholder:text-slate focus-visible:outline-none disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
        <p className="truncate pl-1 text-[12px] text-slate">
          {tooLong ? (
            <span className="text-danger">
              {value.length - maxLength} characters over the limit
            </span>
          ) : (
            scopeLabel
          )}
        </p>
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-rule bg-surface px-3.5 text-[13px] font-medium hover:bg-sunken"
          >
            <StopIcon className="text-[14px]" />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-action text-[18px] text-action-ink transition disabled:opacity-35"
            aria-label="Send question"
          >
            <SendIcon />
          </button>
        )}
      </div>
    </form>
  );
});
