"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculateTotals } from "@/lib/calculations";
import { createImportQuotationSchema, importRowsSchema, invoiceSchema, quotationSchema } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import type { ImportRow, LineItem } from "@/lib/types";

function parseQuotationForm(formData: FormData) {
  const rawItems = String(formData.get("items") || "[]");
  const parsed = quotationSchema.parse({
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
  });
  return parsed;
}

function parseInvoiceForm(formData: FormData) {
  const rawItems = String(formData.get("items") || "[]");
  return invoiceSchema.parse({
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

export async function createQuotation(formData: FormData) {
  const input = parseQuotationForm(formData);
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
  if (error) throw error;

  await supabase.from("quotation_items").insert(
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

  revalidatePath("/quotations");
  redirect(`/quotations/${data.id}/edit`);
}

export async function updateQuotation(id: string, formData: FormData) {
  const input = parseQuotationForm(formData);
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
  if (error) throw error;

  await supabase.from("quotation_items").delete().eq("quotation_id", id);
  await supabase.from("quotation_items").insert(
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

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}/edit`);
}

export async function setQuotationStatus(id: string, status: "pending_approval" | "approved") {
  const supabase = await createClient();
  await supabase.from("quotations").update({ status }).eq("id", id);
  revalidatePath("/dashboard");
  revalidatePath("/quotations");
}

export async function duplicateQuotation(id: string) {
  const supabase = await createClient();
  const { data: quote, error } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: copy, error: insertError } = await supabase
    .from("quotations")
    .insert({
      customer_id: quote.customer_id,
      client_name: quote.client_name,
      project_name: `${quote.project_name} Copy`,
      address: quote.address,
      gst_number: quote.gst_number,
      ship_to_enabled: quote.ship_to_enabled ?? false,
      ship_to_name: quote.ship_to_name ?? null,
      ship_to_address: quote.ship_to_address ?? null,
      ship_to_gst_number: quote.ship_to_gst_number ?? null,
      quote_date: new Date().toISOString().slice(0, 10),
      subtotal: quote.subtotal,
      discount_type: quote.discount_type ?? "amount",
      discount_value: quote.discount_value ?? 0,
      discount_amount: quote.discount_amount ?? 0,
      gst_percent: quote.gst_percent,
      cgst: quote.cgst,
      sgst: quote.sgst,
      grand_total: quote.grand_total,
      amount_in_words: quote.amount_in_words,
      terms: quote.terms,
      status: "draft",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  await supabase.from("quotation_items").insert(
    quote.quotation_items.map((item: LineItem) => ({
      quotation_id: copy.id,
      description: item.description,
      specification: item.specification,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      amount: item.amount,
    })),
  );
  revalidatePath("/quotations");
  redirect(`/quotations/${copy.id}/edit`);
}

export async function convertToInvoice(id: string) {
  const supabase = await createClient();
  const { data: quote, error } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      quotation_id: quote.id,
      customer_id: quote.customer_id,
      client_name: quote.client_name,
      project_name: quote.project_name,
      address: quote.address,
      gst_number: quote.gst_number,
      ship_to_enabled: quote.ship_to_enabled ?? false,
      ship_to_name: quote.ship_to_name ?? null,
      ship_to_address: quote.ship_to_address ?? null,
      ship_to_gst_number: quote.ship_to_gst_number ?? null,
      invoice_date: new Date().toISOString().slice(0, 10),
      payment_terms: "IMMEDIATE",
      terms_of_delivery: "IMMEDIATE",
      subtotal: quote.subtotal,
      discount_type: quote.discount_type ?? "amount",
      discount_value: quote.discount_value ?? 0,
      discount_amount: quote.discount_amount ?? 0,
      gst_percent: quote.gst_percent,
      cgst: quote.cgst,
      sgst: quote.sgst,
      grand_total: quote.grand_total,
      amount_in_words: quote.amount_in_words,
      terms: quote.terms,
    })
    .select("id")
    .single();
  if (invoiceError) throw invoiceError;

  await supabase.from("invoice_items").insert(
    quote.quotation_items.map((item: LineItem) => ({
      invoice_id: invoice.id,
      description: item.description,
      specification: item.specification,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      amount: item.amount,
    })),
  );
  await supabase.from("quotations").update({ status: "converted" }).eq("id", id);
  revalidatePath("/dashboard");
  revalidatePath("/quotations");
  redirect(`/invoices/${invoice.id}`);
}

export async function convertToDeliveryChallan(id: string) {
  const supabase = await createClient();
  const { data: quote, error } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;

  const challanNo = await nextDeliveryChallanNo();
  const { data: challan, error: challanError } = await supabase
    .from("delivery_challans")
    .insert({
      challan_no: challanNo,
      quotation_id: quote.id,
      customer_id: quote.customer_id,
      client_name: quote.client_name,
      project_name: quote.project_name,
      address: quote.ship_to_enabled && quote.ship_to_address ? quote.ship_to_address : quote.address,
      gst_number: quote.ship_to_enabled && quote.ship_to_gst_number ? quote.ship_to_gst_number : quote.gst_number,
      challan_date: new Date().toISOString().slice(0, 10),
      status: "draft",
      selected_columns: ["description", "specification", "qty", "unit"],
      notes: "Generated from quotation",
    })
    .select("id")
    .single();
  if (challanError) {
    redirect(`/delivery-challans?error=${encodeURIComponent(challanError.message)}`);
  }

  const { error: itemError } = await supabase.from("delivery_challan_items").insert(
    quote.quotation_items.map((item: LineItem) => ({
      delivery_challan_id: challan.id,
      description: item.description,
      specification: item.specification,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      amount: item.amount,
    })),
  );
  if (itemError) throw new Error(`Delivery challan was created, but items could not be added: ${itemError.message}`);

  revalidatePath("/delivery-challans");
  redirect(`/delivery-challans/${challan.id}`);
}

export async function updateInvoice(id: string, formData: FormData) {
  const input = parseInvoiceForm(formData);
  const supabase = await createClient();
  const customerId = await upsertCustomer(input.client_name, input.address, input.gst_number);
  const totals = calculateTotals(input.items as LineItem[], input.gst_percent, input.discount_value, input.discount_type);

  const { error } = await supabase
    .from("invoices")
    .update({
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
    .eq("id", id);
  if (error) throw error;

  await supabase.from("invoice_items").delete().eq("invoice_id", id);
  await supabase.from("invoice_items").insert(
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

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath(`/invoices/${id}/edit`);
  redirect(`/invoices/${id}`);
}

export async function updateInvoiceFromForm(formData: FormData) {
  const id = String(formData.get("invoice_id") || "");
  if (!id) throw new Error("Invoice id is missing.");
  await updateInvoice(id, formData);
}

export async function updateDeliveryChallanDetails(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("challan_id"));
  const selectedColumns = formData.getAll("columns").map(String);
  const { error } = await supabase
    .from("delivery_challans")
    .update({
      challan_date: String(formData.get("challan_date") || new Date().toISOString().slice(0, 10)),
      status: String(formData.get("status") || "draft"),
      transporter: String(formData.get("transporter") || "") || null,
      vehicle_no: String(formData.get("vehicle_no") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      selected_columns: selectedColumns.length ? selectedColumns : ["description", "specification", "qty", "unit"],
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/delivery-challans");
  revalidatePath(`/delivery-challans/${id}`);
}

export async function saveImportedRowsToProducts(formData: FormData) {
  const rows = importRowsSchema.parse(JSON.parse(String(formData.get("rows") || "[]")));
  const selected = rows.filter((row) => row.save_to_product || row.matched_product_id);
  const supabase = await createClient();

  for (const row of selected) {
    const productName = row.item_name || row.description;
    if (!productName) continue;

    let productId = row.matched_product_id ?? null;
    if (!productId && row.save_to_product) {
      const { data, error } = await supabase
        .from("products")
        .insert({
          name: productName,
          brand: row.brand,
          category: row.category,
          thickness: row.thickness,
          size: row.size,
          unit: row.unit || "Nos",
          base_rate: row.rate,
          image_url: row.image_url,
          notes: row.raw_text,
        })
        .select("id")
        .single();
      if (error) throw error;
      productId = data.id;
    }

    if (productId) {
      await supabase
        .from("product_aliases")
        .upsert(
          { product_id: productId, alias: productName },
          { onConflict: "product_id,alias", ignoreDuplicates: true },
        );
      if (row.id) {
        await supabase.from("import_rows").update({ matched_product_id: productId }).eq("id", row.id);
      }
    }
  }

  revalidatePath("/import");
}

export async function createQuotationFromImport(formData: FormData) {
  const parsed = createImportQuotationSchema.parse({
    client_name: formData.get("client_name"),
    project_name: formData.get("project_name"),
    address: formData.get("address"),
    gst_number: formData.get("gst_number"),
    quote_date: formData.get("quote_date"),
    gst_percent: formData.get("gst_percent"),
    discount_type: formData.get("discount_type") || "amount",
    discount_value: formData.get("discount_value") || 0,
    terms: formData.get("terms"),
    rows: JSON.parse(String(formData.get("rows") || "[]")),
  });
  const approvedRows = parsed.rows.filter((row) => row.approved);
  if (!approvedRows.length) throw new Error("Approve at least one row before creating a quotation.");

  const supabase = await createClient();
  const customerId = await upsertCustomer(parsed.client_name, parsed.address, parsed.gst_number);
  const items = approvedRows.map(importRowToLineItem);
  const totals = calculateTotals(items, parsed.gst_percent, parsed.discount_value, parsed.discount_type);

  const { data, error } = await supabase
    .from("quotations")
    .insert({
      customer_id: customerId,
      client_name: parsed.client_name,
      project_name: parsed.project_name,
      address: parsed.address,
      gst_number: parsed.gst_number,
      quote_date: parsed.quote_date,
      subtotal: totals.subtotal,
      discount_type: totals.discount_type,
      discount_value: totals.discount_value,
      discount_amount: totals.discount_amount,
      gst_percent: totals.gst_percent,
      cgst: totals.cgst,
      sgst: totals.sgst,
      grand_total: totals.grand_total,
      amount_in_words: totals.amount_in_words,
      terms: parsed.terms,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase.from("quotation_items").insert(
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

  const importedIds = approvedRows.map((row) => row.id).filter(Boolean);
  if (importedIds.length) await supabase.from("import_rows").update({ approved: true }).in("id", importedIds);

  revalidatePath("/quotations");
  redirect(`/quotations/${data.id}/edit`);
}

export async function createPricingRule(formData: FormData) {
  const supabase = await createClient();
  const productId = String(formData.get("product_id") || "");
  const { error } = await supabase.from("pricing_rules").insert({
    product_id: productId || null,
    category: String(formData.get("category") || "") || null,
    brand: String(formData.get("brand") || "") || null,
    margin_percent: Number(formData.get("margin_percent") || 15),
    is_active: true,
  });
  if (error) throw error;
  revalidatePath("/pricing");
}

export async function updateProductRate(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("product_id"));
  const { error } = await supabase
    .from("products")
    .update({
      base_rate: Number(formData.get("base_rate") || 0),
      gst_percent: Number(formData.get("gst_percent") || 18),
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/pricing");
}

export async function updateClientMemory(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("customer_id"));
  const preferredBrands = String(formData.get("preferred_brands") || "")
    .split(",")
    .map((brand) => brand.trim())
    .filter(Boolean);
  const { error } = await supabase
    .from("customers")
    .update({
      payment_terms_days: Number(formData.get("payment_terms_days") || 30),
      preferred_brands: preferredBrands,
      price_sensitivity: String(formData.get("price_sensitivity") || "unknown"),
      risk_level: String(formData.get("risk_level") || "unknown"),
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
}

export async function createSalesOrderFromQuotation(id: string) {
  const supabase = await createClient();
  const { data: quote, error } = await supabase.from("quotations").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: order, error: orderError } = await supabase
    .from("sales_orders")
    .insert({
      quotation_id: quote.id,
      customer_id: quote.customer_id,
      status: "received",
      subtotal: quote.subtotal,
      grand_total: quote.grand_total,
    })
    .select("id")
    .single();
  if (orderError) throw orderError;
  await supabase.from("quotations").update({ status: "converted" }).eq("id", id);
  revalidatePath("/orders");
  redirect(`/orders?created=${order.id}`);
}

export async function updateSalesOrder(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("order_id"));
  const { error } = await supabase
    .from("sales_orders")
    .update({
      po_number: String(formData.get("po_number") || "") || null,
      po_date: String(formData.get("po_date") || "") || null,
      status: String(formData.get("status") || "received"),
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/orders");
}

export async function recordPayment(formData: FormData) {
  const supabase = await createClient();
  const invoiceId = String(formData.get("invoice_id"));
  const customerId = String(formData.get("customer_id"));
  const amount = Number(formData.get("amount") || 0);
  const { error } = await supabase.from("payments").insert({
    invoice_id: invoiceId,
    customer_id: customerId,
    amount,
    payment_date: String(formData.get("payment_date") || new Date().toISOString().slice(0, 10)),
    mode: String(formData.get("mode") || "") || null,
    reference_no: String(formData.get("reference_no") || "") || null,
    notes: String(formData.get("notes") || "") || null,
  });
  if (error) throw error;

  const { data: invoice } = await supabase.from("invoices").select("paid_amount, grand_total").eq("id", invoiceId).single();
  const paidAmount = Number(invoice?.paid_amount || 0) + amount;
  await supabase.from("invoices").update({ paid_amount: paidAmount }).eq("id", invoiceId);
  if (invoice && paidAmount >= Number(invoice.grand_total)) {
    await supabase.from("payment_followups").update({ status: "paid" }).eq("invoice_id", invoiceId);
  }
  revalidatePath("/recovery");
  revalidatePath("/invoices");
}

export async function createPaymentFollowup(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("payment_followups").insert({
    invoice_id: String(formData.get("invoice_id")),
    customer_id: String(formData.get("customer_id")),
    due_date: String(formData.get("due_date") || "") || null,
    promised_date: String(formData.get("promised_date") || "") || null,
    risk_score: Number(formData.get("risk_score") || 0),
    note: String(formData.get("note") || "") || null,
    status: "pending",
  });
  if (error) throw error;
  revalidatePath("/recovery");
}

function importRowToLineItem(row: ImportRow): LineItem {
  const description = row.item_name || row.description || "Imported item";
  const specs = [row.brand, row.category, row.size, row.thickness].filter(Boolean).join(" | ");
  const qty = Number(row.qty) || 1;
  const rate = Number(row.rate) || (row.amount && qty ? Number(row.amount) / qty : 0);
  return {
    description,
    specification: specs || row.raw_text || "",
    qty,
    unit: row.unit || "Nos",
    rate,
    amount: row.amount ?? qty * rate,
  };
}

async function nextDeliveryChallanNo() {
  const year = new Date().getFullYear();
  const fallback = String(Date.now()).slice(-6);
  return `DC/${year}/${fallback}`;
}
