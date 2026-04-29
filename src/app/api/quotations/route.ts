import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { calculateTotals } from "@/lib/calculations";
import { createClient } from "@/lib/supabase/server";
import type { LineItem } from "@/lib/types";
import { quotationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = parseQuotationFormData(formData);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const input = parsed.input;
  const supabase = await createClient();
  const customerId = await upsertCustomer(input.client_name, input.address, input.gst_number);
  const totals = calculateTotals(input.items as LineItem[], input.gst_percent, input.discount_value, input.discount_type);

  const { data, error } = await supabase
    .from("quotations")
    .insert({
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
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: `Could not create quotation: ${error.message}` }, { status: 500 });

  const { error: itemError } = await supabase.from("quotation_items").insert(
    totals.items.map((item) => ({
      quotation_id: data.id,
      description: item.description,
      specification: item.specification,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      amount: item.amount,
    })),
  );
  if (itemError) return NextResponse.json({ ok: false, error: `Quotation created but items failed: ${itemError.message}` }, { status: 500 });

  revalidatePath("/quotations");
  return NextResponse.json({ ok: true, id: data.id });
}

export function parseQuotationFormData(formData: FormData) {
  try {
    const rawItems = String(formData.get("items") || "[]");
    return {
      ok: true as const,
      input: quotationSchema.parse({
        client_name: formData.get("client_name"),
        project_name: formData.get("project_name"),
        address: formData.get("address"),
        gst_number: formData.get("gst_number"),
        ship_to_enabled: formData.get("ship_to_enabled") === "on",
        ship_to_name: formData.get("ship_to_name") || "",
        ship_to_address: formData.get("ship_to_address") || "",
        ship_to_gst_number: formData.get("ship_to_gst_number") || "",
        quote_date: formData.get("quote_date"),
        gst_percent: formData.get("gst_percent"),
        discount_type: formData.get("discount_type") || "amount",
        discount_value: formData.get("discount_value") || 0,
        expected_margin_percent: formData.get("expected_margin_percent") || 15,
        terms: formData.get("terms"),
        items: JSON.parse(rawItems),
      }),
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Invalid quotation data." };
  }
}

export async function upsertCustomer(clientName: string, address: string, gstNumber: string) {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("customers").select("id").eq("name", clientName).maybeSingle();
  if (existing) {
    await supabase.from("customers").update({ address, gst_number: gstNumber }).eq("id", existing.id);
    return existing.id as string;
  }
  const { data, error } = await supabase
    .from("customers")
    .insert({ name: clientName, address, gst_number: gstNumber })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
