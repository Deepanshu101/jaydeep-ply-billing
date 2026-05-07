import { NextResponse } from "next/server";
import { invoicePdfBuffer } from "@/lib/invoice-pdf";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").select("*, invoice_items(*)").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const buffer = await invoicePdfBuffer(data as Invoice);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${String(data.invoice_no).replaceAll("/", "-")}.pdf"`,
    },
  });
}
