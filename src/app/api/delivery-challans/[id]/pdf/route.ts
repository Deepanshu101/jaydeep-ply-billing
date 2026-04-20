import { NextResponse } from "next/server";
import { deliveryChallanPdfBuffer } from "@/lib/delivery-challan-pdf";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryChallan } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const selectedColumns = String(url.searchParams.get("columns") || "")
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_challans")
    .select("*, delivery_challan_items(*)")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Delivery challan not found" }, { status: 404 });

  const pdf = await deliveryChallanPdfBuffer(data as DeliveryChallan, selectedColumns);
  const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${data.challan_no.replaceAll("/", "-")}.pdf"`,
    },
  });
}
