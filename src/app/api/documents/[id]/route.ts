import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";


// DELETE /api/documents/:id — remove a document and its chunks
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { error } = await getSupabase().from("documents").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Delete failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
