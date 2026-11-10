import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { embed, generateAnswer, type ChatTurn } from "@/lib/ai";
import { LIMITS, RAG } from "@/lib/config";
import type { ChatResponse, Source } from "@/lib/types";

export const maxDuration = 60;

type MatchRow = {
  id: number;
  document_id: string;
  document_name: string;
  page: number;
  content: string;
  similarity: number;
};

const SYSTEM_PROMPT = `You answer questions using ONLY the numbered context passages provided.
Rules:
- Cite passages inline like [1] or [2][3] after the sentence they support.
- If the context does not contain the answer, say you couldn't find it in the documents. Do not guess.
- Be concise and use plain language. Use short bullet points when listing things.`;

// POST /api/chat — answer a question from the uploaded documents
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      question?: string;
      history?: ChatTurn[];
      documentIds?: string[];
    };

    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json({ error: "Please type a question." }, { status: 400 });
    }
    if (question.length > LIMITS.maxQuestionLength) {
      return NextResponse.json({ error: "Question is too long." }, { status: 400 });
    }

    // 1. Find the most relevant chunks
    const [queryVector] = await embed([question]);
    const { data, error } = await getSupabase().rpc("match_chunks", {
      query_embedding: queryVector,
      match_count: RAG.topK,
      filter_document_ids: body.documentIds?.length ? body.documentIds : null,
    });
    if (error) throw error;

    const matches = ((data ?? []) as MatchRow[]).filter(
      (m) => m.similarity >= RAG.minSimilarity
    );

    if (matches.length === 0) {
      return NextResponse.json<ChatResponse>({
        answer: "I couldn't find anything about that in your documents.",
        sources: [],
      });
    }

    // 2. Build numbered context for the model
    const sources: Source[] = matches.map((m, i) => ({
      n: i + 1,
      documentId: m.document_id,
      documentName: m.document_name,
      page: m.page,
      excerpt: m.content,
      similarity: Math.round(m.similarity * 100) / 100,
    }));

    const context = sources
      .map((s) => `[${s.n}] (${s.documentName}, page ${s.page})\n${s.excerpt}`)
      .join("\n\n");

    // Keep the last few turns so follow-up questions make sense
    const history = (body.history ?? [])
      .filter((t) => (t.role === "user" || t.role === "assistant") && t.content)
      .slice(-6);

    const messages: ChatTurn[] = [
      ...history,
      { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
    ];

    // 3. Ask the model
    const answer = await generateAnswer(SYSTEM_PROMPT, messages);

    // Only return sources the answer actually cited (fall back to all)
    const cited = sources.filter((s) => answer.includes(`[${s.n}]`));

    return NextResponse.json<ChatResponse>({
      answer,
      sources: cited.length ? cited : sources,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
