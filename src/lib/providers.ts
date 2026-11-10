// Bring-your-own-key AI providers. Calls go straight from the browser to the provider:
// PageProof has no server that sees the key or the documents.

export type ProviderId = "gemini" | "groq" | "openai" | "anthropic";

export type Provider = {
  id: ProviderId;
  name: string;
  freeKey: boolean;
  keyUrl: string;
  keyHint: string;
  note?: string;
};

export const PROVIDERS: Provider[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    freeKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "Starts with AIza",
    note: "Free keys come with a catch: Google may use free-tier data to improve its models. Avoid confidential documents on a free key.",
  },
  {
    id: "groq",
    name: "Groq",
    freeKey: true,
    keyUrl: "https://console.groq.com/keys",
    keyHint: "Starts with gsk_",
    note: "Free plan has daily request limits.",
  },
  { id: "openai", name: "OpenAI", freeKey: false, keyUrl: "https://platform.openai.com/api-keys", keyHint: "Starts with sk-" },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    freeKey: false,
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "Starts with sk-ant-",
  },
];

export const providerName = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)?.name ?? id;

export type AiSettings = { provider: ProviderId; apiKey: string; model: string };
export type ChatTurn = { role: "user" | "assistant"; content: string };

export class ProviderError extends Error {}

const OPENAI_BASE: Record<"openai" | "groq", string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
};
const ANTHROPIC_HEADERS = (key: string) => ({
  "x-api-key": key,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
});

// ---------- Errors in plain language ----------

async function failure(res: Response, provider: ProviderId): Promise<ProviderError> {
  const name = providerName(provider);
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.message || "";
  } catch {
    // ignore
  }
  if (res.status === 400 && /api key|API_KEY/i.test(detail))
    return new ProviderError(`${name} didn't accept that key. Check it and try again.`);
  if (res.status === 401 || res.status === 403)
    return new ProviderError(`${name} didn't accept that key. Check it and try again.`);
  if (res.status === 429)
    return new ProviderError(`${name} says the limit for this key has been reached. Wait a minute, or check your plan.`);
  if (res.status === 404) return new ProviderError(`${name} couldn't find that model. Pick another in Connect AI.`);
  return new ProviderError(`${name} returned an error (${res.status}). Try again in a moment.`);
}

async function call(provider: ProviderId, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ProviderError(`Couldn't reach ${providerName(provider)}. Check your connection.`);
  }
  if (!res.ok) throw await failure(res, provider);
  return res;
}

// ---------- Models: loaded live so names never go stale ----------

const EXCLUDE = /(embed|whisper|tts|audio|realtime|transcribe|image|vision-only|guard|moderation|search|dall|babbage|davinci|instruct|computer-use|veo|imagen|aqa|learnlm)/i;

export async function listModels(provider: ProviderId, apiKey: string): Promise<string[]> {
  let ids: string[] = [];
  if (provider === "gemini") {
    const res = await call(provider, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": apiKey },
    });
    const data = await res.json();
    ids = (data.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""));
  } else if (provider === "anthropic") {
    const res = await call(provider, "https://api.anthropic.com/v1/models?limit=100", {
      headers: ANTHROPIC_HEADERS(apiKey),
    });
    ids = ((await res.json()).data ?? []).map((m: { id: string }) => m.id);
  } else {
    const res = await call(provider, `${OPENAI_BASE[provider]}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    ids = ((await res.json()).data ?? []).map((m: { id: string }) => m.id);
  }
  ids = ids.filter((id) => !EXCLUDE.test(id));
  if (ids.length === 0) throw new ProviderError(`No chat models are available on this ${providerName(provider)} key.`);
  return sortModels(provider, ids);
}

// Put a fast, inexpensive model first as the default
function sortModels(provider: ProviderId, ids: string[]): string[] {
  const prefer: Record<ProviderId, RegExp[]> = {
    gemini: [/flash(?!.*(lite|thinking|exp|preview))/i, /flash/i],
    groq: [/gpt-oss-120b/i, /llama.*70b/i, /llama/i],
    openai: [/^gpt-[\d.]+-mini$/i, /mini/i, /^gpt/i],
    anthropic: [/haiku/i, /sonnet/i],
  };
  const rank = (id: string) => {
    const i = prefer[provider].findIndex((re) => re.test(id));
    return i === -1 ? 99 : i;
  };
  // Newest-looking names first within the same rank
  return [...ids].sort((a, b) => rank(a) - rank(b) || b.localeCompare(a, undefined, { numeric: true }));
}

// ---------- Streaming answers ----------

async function* sseData(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data && data !== "[DONE]") yield data;
      }
    }
  }
}

export async function* streamAnswer(
  settings: AiSettings,
  system: string,
  messages: ChatTurn[],
  signal: AbortSignal
): AsyncGenerator<string> {
  const { provider, apiKey, model } = settings;

  if (provider === "gemini") {
    const res = await call(
      provider,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { temperature: 0.2 },
        }),
      }
    );
    for await (const data of sseData(res)) {
      const json = JSON.parse(data);
      const text = (json.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      if (text) yield text;
    }
    return;
  }

  if (provider === "anthropic") {
    const res = await call(provider, "https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", ...ANTHROPIC_HEADERS(apiKey) },
      body: JSON.stringify({ model, max_tokens: 1024, system, messages, stream: true }),
    });
    for await (const data of sseData(res)) {
      const json = JSON.parse(data);
      if (json.type === "content_block_delta" && json.delta?.type === "text_delta") yield json.delta.text;
      if (json.type === "error") throw new ProviderError(json.error?.message || "Claude stopped with an error.");
    }
    return;
  }

  const res = await call(provider, `${OPENAI_BASE[provider]}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  for await (const data of sseData(res)) {
    const text = JSON.parse(data).choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

// ---------- Saved settings (this browser only) ----------

const KEY = "pageproof.ai.v1";

export function loadAiSettings(): { settings: AiSettings | null; remembered: boolean } {
  try {
    const local = localStorage.getItem(KEY);
    if (local) return { settings: JSON.parse(local), remembered: true };
    const session = sessionStorage.getItem(KEY);
    if (session) return { settings: JSON.parse(session), remembered: false };
  } catch {
    // storage blocked
  }
  return { settings: null, remembered: false };
}

export function saveAiSettings(settings: AiSettings | null, remember: boolean) {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    if (settings) (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage blocked: the key works for this visit only
  }
}
