import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { calculateTotals } from "@/lib/calculations";
import { createClient } from "@/lib/supabase/server";
import type { LineItem } from "@/lib/types";
import { parseQuotationFormData, upsertCustomer } from "../route";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await request.formData();
  const parsed = parseQuotationFormData(formData);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const input = parsed.input;
  const supabase = await createClient();
  const customerId = await upsertCustomer(input.client_name, input.address, input.gst_number);
  const totals = calculateTotals(input.items as LineItem[], input.gst_percent, input.discount_value, input.discount_type);

  const { error } = await supabase
    .from("quotations")
    .update({
      customer_id: customerId,
      client_name: input.client_name,
      project_name: input.project_name,
      address: input.address,
      gst_number: input.gst_number,
      ship_to_enabled: input.ship_to_enabled,
      ship_to_name: input.ship_to_enabled ? input.ship_to_name || input.client_name : null,
      ship_to_address: input.ship_to_enabled ? input.ship_to_address || input.address : null,
      ship_to_gst_number: input.ship_to_enabled ? input.ship_to_gst_number || input.gst_number : null,
      quote_date: input.quote_date,
      gst_percent: totals.gst_percent,
      subtotal: totals.subtotal,
      discount_type: totals.discount_type,
      discount_value: totals.discount_value,
      discount_amount: totals.discount_amount,
      expected_margin_percent: input.expected_margin_percent,
      cgst: totals.cgst,
      sgst: totals.sgst,
      grand_total: totals.grand_total,
      amount_in_words: totals.amount_in_words,
      terms: input.terms,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: `Could not update quotation: ${error.message}` }, { status: 500 });

  const { error: deleteError } = await supabase.from("quotation_items").delete().eq("quotation_id", id);
  if (deleteError) return NextResponse.json({ ok: false, error: `Could not replace quotation items: ${deleteError.message}` }, { status: 500 });

  const { error: itemError } = await supabase.from("quotation_items").insert(
    totals.items.map((item) => ({
      quotation_id: id,
      description: item.description,
      specification: item.specification,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      amount: item.amount,
    })),
  );
  if (itemError) return NextResponse.json({ ok: false, error: `Could not save quotation items: ${itemError.message}` }, { status: 500 });

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}/edit`);
  return NextResponse.json({ ok: true, id });
}
