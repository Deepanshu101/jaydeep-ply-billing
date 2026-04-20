import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { calculateTotals } from "@/lib/calculations";
import { createClient } from "@/lib/supabase/server";
import type { LineItem } from "@/lib/types";
import { invoiceSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await request.formData();
  const rawItems = String(formData.get("items") || "[]");

  let input: ReturnType<typeof invoiceSchema.parse>;
  try {
    input = invoiceSchema.parse({
      client_name: formData.get("client_name"),
      project_name: formData.get("project_name"),
      address: formData.get("address"),
      gst_number: formData.get("gst_number"),
      invoice_date: formData.get("invoice_date"),
      due_date: formData.get("due_date") || "",
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

  const { error } = await supabase
    .from("invoices")
    .update({
      customer_id: customerId,
      client_name: input.client_name,
      project_name: input.project_name,
      address: input.address,
      gst_number: input.gst_number,
      invoice_date: input.invoice_date,
      due_date: input.due_date || null,
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
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: `Could not update invoice: ${error.message}. If this mentions a missing column, run the latest Supabase SQL migration.`,
      },
      { status: 500 },
    );
  }

  const { error: deleteError } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
  if (deleteError) return NextResponse.json({ ok: false, error: `Could not replace invoice items: ${deleteError.message}` }, { status: 500 });

  const { error: itemError } = await supabase.from("invoice_items").insert(
    totals.items.map((item) => ({
      invoice_id: id,
      description: item.description,
      specification: item.specification,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      amount: item.amount,
    })),
  );
  if (itemError) return NextResponse.json({ ok: false, error: `Could not save invoice items: ${itemError.message}` }, { status: 500 });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath(`/invoices/${id}/edit`);
  return NextResponse.json({ ok: true });
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
