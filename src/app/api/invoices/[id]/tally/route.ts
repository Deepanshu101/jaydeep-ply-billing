import { NextResponse } from "next/server";
import { invoiceToTallyXml } from "@/lib/tally";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(_request.url);
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").select("*, invoice_items(*)").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const xml = invoiceToTallyXml(data as Invoice, {
    voucherTypeName: url.searchParams.get("voucherTypeName") || undefined,
    salesLedgerName: url.searchParams.get("salesLedgerName") || undefined,
    cgstLedgerName: url.searchParams.get("cgstLedgerName") || undefined,
    sgstLedgerName: url.searchParams.get("sgstLedgerName") || undefined,
    igstLedgerName: url.searchParams.get("igstLedgerName") || undefined,
    roundOffLedgerName: url.searchParams.get("roundOffLedgerName") || undefined,
    godownName: url.searchParams.get("godownName") || undefined,
    isInterstate: url.searchParams.get("isInterstate") === "true",
    narration: url.searchParams.get("narration") || undefined,
    orderReference: url.searchParams.get("orderReference") || undefined,
  });
  return new NextResponse(xml, {
    headers: {
      "content-type": "application/xml",
      "content-disposition": `attachment; filename="${data.invoice_no.replaceAll("/", "-")}-tally.xml"`,
    },
  });
}
