"use client";

import { useEffect, useRef, useState } from "react";
import {
  PROVIDERS,
  ProviderError,
  listModels,
  providerName,
  type AiSettings,
  type ProviderId,
} from "@/lib/providers";
import { CheckIcon, CloseIcon } from "./icons";

type Props = {
  current: AiSettings | null;
  remembered: boolean;
  onSave: (settings: AiSettings, remember: boolean) => void;
  onDisconnect: () => void;
  onClose: () => void;
};

export function ConnectAI({ current, remembered, onSave, onDisconnect, onClose }: Props) {
  const [provider, setProvider] = useState<ProviderId>(current?.provider ?? "gemini");
  const [apiKey, setApiKey] = useState(current?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>(current ? [current.model] : []);
  const [model, setModel] = useState(current?.model ?? "");
  const [remember, setRemember] = useState(current ? remembered : true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(Boolean(current));
  const keyInput = useRef<HTMLInputElement>(null);
  const info = PROVIDERS.find((p) => p.id === provider)!;

  useEffect(() => {
    keyInput.current?.focus();
  }, [provider]);

  function pick(id: ProviderId) {
    if (id === provider) return;
    setProvider(id);
    setApiKey(current?.provider === id ? current.apiKey : "");
    setModels(current?.provider === id ? [current.model] : []);
    setModel(current?.provider === id ? current.model : "");
    setVerified(current?.provider === id);
    setError(null);
  }

  async function check() {
    const key = apiKey.trim();
    if (!key) return;
    setChecking(true);
    setError(null);
    try {
      const list = await listModels(provider, key);
      setModels(list);
      setModel(list.includes(model) ? model : list[0]);
      setVerified(true);
    } catch (err) {
      setVerified(false);
      setError(err instanceof ProviderError ? err.message : `Couldn't check the key with ${info.name}.`);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby="connect-title">
      <button className="absolute inset-0 bg-ink/40" onClick={onClose} aria-label="Close" />
      <div className="sheet-enter relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-lift md:max-w-[520px] md:rounded-2xl md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="connect-title" className="text-[19px] font-semibold">Connect your AI</h2>
            <p className="mt-1 text-[14px] text-slate">
              Optional. Without it, PageProof still finds the exact passages. With it, you also get written answers, and you can ask in any language, including Tamil and Hindi.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[18px] text-slate hover:bg-sunken" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="text-[13px] font-medium text-slate">Provider</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <label
                key={p.id}
                className={`cursor-pointer rounded-xl border px-3 py-2.5 transition ${
                  provider === p.id ? "border-action bg-action-soft" : "border-rule hover:border-slate"
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.id}
                  checked={provider === p.id}
                  onChange={() => pick(p.id)}
                  className="sr-only"
                />
                <span className="block text-[14px] font-medium">{p.name}</span>
                <span className={`block text-[12px] ${p.freeKey ? "text-ok" : "text-slate"}`}>
                  {p.freeKey ? "Free key available" : "Paid key"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (verified && model) onSave({ provider, apiKey: apiKey.trim(), model }, remember);
            else check();
          }}
        >
          <div className="flex items-baseline justify-between">
            <label htmlFor="api-key" className="text-[13px] font-medium text-slate">
              {info.name} API key
            </label>
            <a href={info.keyUrl} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-action hover:underline">
              {info.freeKey ? "Get a free key" : "Get a key"}
            </a>
          </div>
          <div className="mt-1.5 flex gap-2">
            <input
              id="api-key"
              ref={keyInput}
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setVerified(false);
                setError(null);
              }}
              placeholder={info.keyHint}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-3 py-2.5 font-mono text-[14px] outline-none focus:border-action"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="rounded-lg border border-rule px-3 text-[13px] hover:bg-sunken"
              aria-pressed={showKey}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>

          {info.note && <p className="mt-2 text-[12.5px] text-slate">{info.note}</p>}

          {error && (
            <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[13.5px] text-danger" role="alert">
              {error}
            </p>
          )}

          {verified && models.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-[13.5px] text-ok">
                <CheckIcon /> Key works
              </p>
              <label htmlFor="model" className="mt-3 block text-[13px] font-medium text-slate">
                Model
              </label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-action"
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[12px] text-slate">The first one is a fast, low-cost choice.</p>
            </div>
          )}

          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13.5px]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--action)]"
            />
            <span>
              Remember on this device
              <span className="block text-[12px] text-slate">Off: the key is forgotten when you close this tab.</span>
            </span>
          </label>

          <p className="mt-4 rounded-lg bg-sunken px-3 py-2.5 text-[12.5px] text-slate">
            Your key stays in this browser and is sent only to {info.name}. PageProof has no server, so it never sees your
            key or your documents.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            {current ? (
              <button
                type="button"
                onClick={onDisconnect}
                className="text-[13.5px] font-medium text-danger hover:underline"
              >
                Disconnect {providerName(current.provider)}
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={!apiKey.trim() || checking}
              className="rounded-xl bg-action px-5 py-2.5 font-medium text-action-ink transition hover:opacity-90 disabled:opacity-40"
            >
              {checking ? "Checking key" : verified ? "Save and connect" : "Check key"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
