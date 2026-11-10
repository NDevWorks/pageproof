import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { embed } from "@/lib/ai";
import { chunkPages } from "@/lib/chunk";
import { extractPdfPages } from "@/lib/pdf";
import { LIMITS } from "@/lib/config";

export const maxDuration = 60;

// GET /api/documents — list uploaded documents
export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from("documents")
      .select("id, name, page_count, chunk_count, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ documents: data });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/documents — upload a PDF, split it, embed it, store it
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }
    if (file.size > LIMITS.maxFileSizeMb * 1024 * 1024) {
      return NextResponse.json(
        { error: `File is too large. Max ${LIMITS.maxFileSizeMb} MB.` },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { count } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) >= LIMITS.maxDocuments) {
      return NextResponse.json(
        { error: `Document limit reached (${LIMITS.maxDocuments}). Delete one first.` },
        { status: 400 }
      );
    }

    const pages = await extractPdfPages(await file.arrayBuffer());
    if (pages.length > LIMITS.maxPages) {
      return NextResponse.json(
        { error: `PDF has ${pages.length} pages. Max ${LIMITS.maxPages}.` },
        { status: 400 }
      );
    }

    const chunks = chunkPages(pages);
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No text found. Scanned PDFs need OCR first." },
        { status: 400 }
      );
    }

    const vectors = await embed(chunks.map((c) => c.content));

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({ name: file.name, page_count: pages.length, chunk_count: chunks.length })
      .select("id, name, page_count, chunk_count, created_at")
      .single();
    if (docError) throw docError;

    const rows = chunks.map((c, i) => ({
      document_id: doc.id,
      page: c.page,
      content: c.content,
      embedding: vectors[i],
    }));

    // Insert in batches to keep request sizes reasonable
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("chunks").insert(rows.slice(i, i + 200));
      if (error) {
        await supabase.from("documents").delete().eq("id", doc.id); // roll back
        throw error;
      }
    }

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  console.error(err);
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status: 500 });
}
