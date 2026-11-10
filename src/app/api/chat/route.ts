import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { embed, streamAnswer, type ChatTurn } from "@/lib/ai";
import { LIMITS, RAG } from "@/lib/config";
import type { ChatEvent, Source } from "@/lib/types";

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
- Cite passages inline like [1] or [2][3] right after the sentence they support.
- If the context does not contain the answer, say you couldn't find it in the documents. Do not guess.
- Be concise and use plain language. Use Markdown: short paragraphs, bullet lists for multiple items, **bold** for key figures and dates.`;

// POST /api/chat — answer a question from the uploaded documents, streamed as NDJSON
export async function POST(req: Request) {
  let body: { question?: string; history?: ChatTurn[]; documentIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  }
  if (question.length > LIMITS.maxQuestionLength) {
    return NextResponse.json(
      { error: `Questions can be up to ${LIMITS.maxQuestionLength} characters.` },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        // 1. Find the most relevant passages
        send({ type: "status", stage: "searching" });
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

        const sources: Source[] = matches.map((m, i) => ({
          n: i + 1,
          documentId: m.document_id,
          documentName: m.document_name,
          page: m.page,
          excerpt: m.content,
          similarity: Math.round(m.similarity * 100) / 100,
        }));
        send({ type: "sources", sources });

        if (sources.length === 0) {
          send({
            type: "delta",
            text: "I couldn't find anything about that in your documents. Try different words, or check the right documents are selected.",
          });
          send({ type: "done" });
          return;
        }

        // 2. Build numbered context and keep a few turns for follow-ups
        const context = sources
          .map((s) => `[${s.n}] (${s.documentName}, page ${s.page})\n${s.excerpt}`)
          .join("\n\n");

        const history = (body.history ?? [])
          .filter((t) => (t.role === "user" || t.role === "assistant") && t.content)
          .slice(-6);

        // 3. Stream the answer
        send({ type: "status", stage: "writing" });
        for await (const text of streamAnswer(
          SYSTEM_PROMPT,
          [...history, { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` }],
          req.signal
        )) {
          send({ type: "delta", text });
        }
        send({ type: "done" });
      } catch (err) {
        if (req.signal.aborted) return; // user pressed Stop
        console.error(err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "The answer couldn't be generated.",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
