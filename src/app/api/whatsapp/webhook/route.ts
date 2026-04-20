import { NextResponse } from "next/server";
import { calculateTotals } from "@/lib/calculations";
import { parseImportRows } from "@/lib/import/parser";
import { applyPricing } from "@/lib/pricing";
import { amountInWords } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ImportRow, PricingRule, Product } from "@/lib/types";

export const runtime = "nodejs";

type WhatsAppMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: "text" | "image" | "document";
  text?: { body?: string };
  image?: { id?: string; mime_type?: string };
  document?: { id?: string; mime_type?: string; filename?: string };
};

type MessageSource = {
  text: string;
  file?: {
    name: string;
    mimeType: string;
    dataUrl: string;
  };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const messages = collectMessages(payload);
    const results = [];

    for (const message of messages) {
      results.push(await processMessage(message, payload));
    }

    return NextResponse.json({ received: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp intake failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function collectMessages(payload: unknown): WhatsAppMessage[] {
  const entries = (payload as { entry?: { changes?: { value?: { messages?: WhatsAppMessage[] } }[] }[] }).entry ?? [];
  return entries.flatMap((entry) => entry.changes ?? []).flatMap((change) => change.value?.messages ?? []);
}

async function processMessage(message: WhatsAppMessage, rawPayload: unknown) {
  const supabase = createAdminClient();
  const source = await getMessageSource(message);
  const context = await loadContext(supabase);
  const extractedRows = await parseImportRows({
    sourceType: message.type === "document" ? "pdf" : message.type === "image" ? "image" : "text",
    text: source.text,
    files: source.file ? [source.file] : [],
    products: context.products,
    aliases: context.aliases,
  });
  const rows = applyPricing(extractedRows, context.products, context.pricingRules);

  const { data: intake } = await supabase
    .from("whatsapp_intake")
    .insert({
      whatsapp_message_id: message.id,
      from_number: message.from,
      source_type: message.type ?? "text",
      raw_payload: rawPayload,
      raw_text: source.text || source.file?.name,
      status: "draft_created",
    })
    .select("id")
    .single();

  const { data: customer } = await supabase
    .from("customers")
    .insert({
      name: `WhatsApp ${message.from ?? "Client"}`,
      phone: message.from,
      address: "Address pending",
    })
    .select("id")
    .single();

  const totals = calculateTotals(rows.map(importRowToLineItem), 18);
  const { data: quote } = await supabase
    .from("quotations")
    .insert({
      customer_id: customer?.id,
      client_name: `WhatsApp ${message.from ?? "Client"}`,
      project_name: "WhatsApp BOQ Import",
      address: "Address pending",
      gst_number: "",
      quote_date: new Date().toISOString().slice(0, 10),
      subtotal: totals.subtotal,
      gst_percent: totals.gst_percent,
      cgst: totals.cgst,
      sgst: totals.sgst,
      grand_total: totals.grand_total,
      amount_in_words: amountInWords(totals.grand_total),
      terms: "Draft created from WhatsApp BOQ. Review rates, client details, and terms before sending.",
      status: "draft",
    })
    .select("id")
    .single();

  if (quote?.id && totals.items.length) {
    await supabase.from("quotation_items").insert(
      totals.items.map((item) => ({
        quotation_id: quote.id,
        description: item.description,
        specification: item.specification,
        qty: item.qty,
        unit: item.unit,
        rate: item.rate,
        amount: item.amount,
      })),
    );
  }

  if (intake?.id && quote?.id) await supabase.from("whatsapp_intake").update({ quotation_id: quote.id }).eq("id", intake.id);
  return { message_id: message.id, quotation_id: quote?.id ?? null, rows: rows.length };
}

async function getMessageSource(message: WhatsAppMessage): Promise<MessageSource> {
  if (message.type === "text") return { text: message.text?.body ?? "" };
  const mediaId = message.image?.id ?? message.document?.id;
  if (!mediaId) return { text: "" };
  return downloadMediaAsText(mediaId);
}

async function downloadMediaAsText(mediaId: string) {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) {
    return { text: `WhatsApp media ${mediaId} received. Add WHATSAPP_ACCESS_TOKEN to download media.` };
  }
  const meta = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!meta.ok) return { text: `WhatsApp media ${mediaId} metadata download failed.` };
  const { url, mime_type } = await meta.json();
  const media = await fetch(url, { headers: { authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } });
  if (!media.ok) return { text: `WhatsApp media ${mediaId} download failed.` };
  const buffer = Buffer.from(await media.arrayBuffer());
  return {
    text: `WhatsApp ${mime_type ?? "media"} ${mediaId}`,
    file: {
      name: `whatsapp-${mediaId}`,
      mimeType: mime_type ?? "application/octet-stream",
      dataUrl: `data:${mime_type ?? "application/octet-stream"};base64,${buffer.toString("base64")}`,
    },
  };
}

async function loadContext(supabase: ReturnType<typeof createAdminClient>) {
  const [{ data: products }, { data: aliases }, { data: pricingRules }] = await Promise.all([
    supabase.from("products").select("*").eq("is_active", true),
    supabase.from("product_aliases").select("product_id, alias, products(*)"),
    supabase.from("pricing_rules").select("*").eq("is_active", true),
  ]);

  return {
    products: (products ?? []) as Product[],
    aliases: (aliases ?? []).map((alias) => ({
      product_id: String(alias.product_id),
      alias: String(alias.alias),
      products: Array.isArray(alias.products) ? (alias.products[0] as Product | undefined) : (alias.products as Product | null),
    })),
    pricingRules: (pricingRules ?? []) as PricingRule[],
  };
}

function importRowToLineItem(row: ImportRow) {
  const qty = Number(row.qty || 1);
  const rate = Number(row.rate || 0);
  return {
    description: row.item_name || row.description || "WhatsApp item",
    specification: [row.brand, row.category, row.size, row.thickness].filter(Boolean).join(" | "),
    qty,
    unit: row.unit || "Nos",
    rate,
    amount: Number(row.amount || qty * rate),
  };
}
