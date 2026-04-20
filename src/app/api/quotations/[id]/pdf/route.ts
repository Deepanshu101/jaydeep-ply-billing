import { NextResponse } from "next/server";
import { quotationPdfBuffer } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/server";
import type { Quotation } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("quotations").select("*, quotation_items(*)").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const pdf = await quotationPdfBuffer(data as Quotation);
  const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${data.quotation_no.replaceAll("/", "-")}.pdf"`,
    },
  });
}
