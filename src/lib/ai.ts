import "server-only";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "./config";
import { requireEnv } from "./env";

let openai: OpenAI | null = null;
function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return openai;
}

let anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return anthropic;
}

// Turn text into vectors. Batched to stay within API request limits.
export async function embed(texts: string[]): Promise<number[][]> {
  const batchSize = 100;
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const res = await getOpenAI().embeddings.create({
      model: MODELS.embedding,
      input: texts.slice(i, i + batchSize),
    });
    vectors.push(...res.data.map((d) => d.embedding));
  }
  return vectors;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

// Stream the answer piece by piece from the chosen provider (OpenAI or Claude).
export async function* streamAnswer(
  system: string,
  messages: ChatTurn[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  if (MODELS.provider === "anthropic") {
    const stream = getAnthropic().messages.stream(
      { model: MODELS.anthropicChat, max_tokens: 1024, system, messages },
      { signal }
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    return;
  }

  const stream = await getOpenAI().chat.completions.create(
    {
      model: MODELS.openaiChat,
      temperature: 0.2,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    },
    { signal }
  );
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}
