import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { calculateTotals } from "@/lib/calculations";
import { createClient } from "@/lib/supabase/server";
import type { LineItem } from "@/lib/types";
import { invoiceSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();

  let input: ReturnType<typeof invoiceSchema.parse>;
  try {
    const rawItems = String(formData.get("items") || "[]");
    input = invoiceSchema.parse({
      invoice_no: formData.get("invoice_no") || "",
      client_name: formData.get("client_name"),
      project_name: formData.get("project_name"),
      address: formData.get("address"),
      gst_number: formData.get("gst_number"),
      ship_to_enabled: formData.get("ship_to_enabled") === "on",
      ship_to_name: formData.get("ship_to_name") || "",
      ship_to_address: formData.get("ship_to_address") || "",
      ship_to_gst_number: formData.get("ship_to_gst_number") || "",
      invoice_date: formData.get("invoice_date"),
      due_date: formData.get("due_date") || "",
      dispatch_doc_no: formData.get("dispatch_doc_no") || "",
      dispatch_date: formData.get("dispatch_date") || "",
      dispatched_through: formData.get("dispatched_through") || "",
      destination: formData.get("destination") || "",
      carrier_name: formData.get("carrier_name") || "",
      bill_lading_no: formData.get("bill_lading_no") || "",
      vehicle_no: formData.get("vehicle_no") || "",
      order_no: formData.get("order_no") || "",
      order_date: formData.get("order_date") || "",
      payment_terms: formData.get("payment_terms") || "",
      other_references: formData.get("other_references") || "",
      terms_of_delivery: formData.get("terms_of_delivery") || "",
      gst_percent: formData.get("gst_percent"),
      discount_type: formData.get("discount_type") || "amount",
      discount_value: formData.get("discount_value") || 0,
      terms: formData.get("terms"),
      items: JSON.parse(rawItems),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid invoice data." }, { status: 400 });
  }

  const supabase = await createClient();
  const customerId = await upsertCustomer(input.client_name, input.address, input.gst_number);
  const totals = calculateTotals(input.items as LineItem[], input.gst_percent, input.discount_value, input.discount_type);

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      invoice_no: input.invoice_no || undefined,
      customer_id: customerId,
      client_name: input.client_name,
      project_name: input.project_name,
      address: input.address,
      gst_number: input.gst_number,
      ship_to_enabled: input.ship_to_enabled,
      ship_to_name: input.ship_to_enabled ? input.ship_to_name || input.client_name : null,
      ship_to_address: input.ship_to_enabled ? input.ship_to_address || input.address : null,
      ship_to_gst_number: input.ship_to_enabled ? input.ship_to_gst_number || input.gst_number : null,
      invoice_date: input.invoice_date,
      due_date: input.due_date || null,
      dispatch_doc_no: input.dispatch_doc_no || null,
      dispatch_date: input.dispatch_date || null,
      dispatched_through: input.dispatched_through || null,
      destination: input.destination || null,
      carrier_name: input.carrier_name || null,
      bill_lading_no: input.bill_lading_no || null,
      vehicle_no: input.vehicle_no || null,
      order_no: input.order_no || null,
      order_date: input.order_date || null,
      payment_terms: input.payment_terms || null,
      other_references: input.other_references || null,
      terms_of_delivery: input.terms_of_delivery || null,
      subtotal: totals.subtotal,
      discount_type: totals.discount_type,
      discount_value: totals.discount_value,
      discount_amount: totals.discount_amount,
      gst_percent: totals.gst_percent,
      cgst: totals.cgst,
      sgst: totals.sgst,
      grand_total: totals.grand_total,
      amount_in_words: totals.amount_in_words,
      terms: input.terms,
      tally_sync_status: "not_synced",
      tally_synced_at: null,
      tally_response: null,
      tally_request_xml: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: `Could not create invoice: ${error?.message || "Unknown error."}` }, { status: 500 });
  }

  const { error: itemError } = await supabase.from("invoice_items").insert(
    totals.items.map((item) => ({
      invoice_id: data.id,
      description: item.description,
      specification: item.specification,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      amount: item.amount,
    })),
  );

  if (itemError) {
    return NextResponse.json({ ok: false, error: `Invoice created but items failed: ${itemError.message}` }, { status: 500 });
  }

  revalidatePath("/invoices");
  return NextResponse.json({ ok: true, id: data.id });
}

async function upsertCustomer(clientName: string, address: string, gstNumber: string) {
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
