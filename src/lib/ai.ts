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

// Ask the chosen model (OpenAI or Claude) to answer using only the given context.
export async function generateAnswer(
  system: string,
  messages: ChatTurn[]
): Promise<string> {
  if (MODELS.provider === "anthropic") {
    const res = await getAnthropic().messages.create({
      model: MODELS.anthropicChat,
      max_tokens: 1024,
      system,
      messages,
    });
    return res.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
  }

  const res = await getOpenAI().chat.completions.create({
    model: MODELS.openaiChat,
    temperature: 0.2,
    messages: [{ role: "system", content: system }, ...messages],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}
