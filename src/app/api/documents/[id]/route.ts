import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { publicError } from "@/lib/errors";

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
    const e = publicError(err, "delete");
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }
}
