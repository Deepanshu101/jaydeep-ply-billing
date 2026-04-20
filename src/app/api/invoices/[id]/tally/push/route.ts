import { NextResponse } from "next/server";
import {
  collectNodes,
  invoiceToTallyXml,
  nodeText,
  parseTallyXml,
  postToTally,
  stockItemsToTallyXml,
  tallyExportXml,
  TallyRequestError,
  type TallyInvoiceOptions,
} from "@/lib/tally";
import { createClient } from "@/lib/supabase/server";
import type { Invoice, LineItem } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").select("*, invoice_items(*)").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  let options: TallyInvoiceOptions = {};
  try {
    options = (await _request.json()) as TallyInvoiceOptions;
  } catch {
    options = {};
  }

  const invoice = data as Invoice;
  if ((invoice.discount_amount ?? 0) > 0 && !options.accountingMode && !options.discountLedgerName?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This invoice has discount. For inventory voucher push, enter a Discount ledger name from Tally, or use Accounting invoice fallback.",
      },
      { status: 400 },
    );
  }
  const stockCheck = await ensureInvoiceStockItems(invoice, options);
  if (!stockCheck.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: stockCheck.error,
        missingStockItems: stockCheck.missingStockItems,
      },
      { status: 400 },
    );
  }

  const xml = invoiceToTallyXml(invoice, options);
  try {
    const tallyResponse = await postToTally(xml, `invoice push ${data.invoice_no}`);
    const tallyResult = parseTallyImportResult(tallyResponse);
    const tallyOk = tallyResult.ok;

    await supabase
      .from("invoices")
      .update({
        tally_sync_status: tallyOk ? "synced" : "failed",
        tally_synced_at: tallyOk ? new Date().toISOString() : null,
        tally_response: tallyResponse,
        tally_request_xml: xml,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: tallyOk,
      tallyResult,
      requestXml: xml,
      response: tallyResponse,
      message: tallyOk ? "Invoice pushed to Tally." : tallyResult.message,
    }, { status: tallyOk ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tally push failed.";
    const responseBody = error instanceof TallyRequestError ? error.responseBody : "";
    await supabase
      .from("invoices")
      .update({
        tally_sync_status: "failed",
        tally_synced_at: null,
        tally_response: responseBody || message,
        tally_request_xml: xml,
      })
      .eq("id", id);
    return NextResponse.json({ ok: false, error: message, requestXml: xml, response: responseBody }, { status: 500 });
  }
}

async function ensureInvoiceStockItems(invoice: Invoice, options: TallyInvoiceOptions) {
  if (options.accountingMode) return { ok: true, missingStockItems: [] };
  const invoiceItems = invoice.invoice_items ?? [];
  const existing = await fetchTallyStockItemNames();
  const missingItems = uniqueMissingItems(invoiceItems, existing);

  if (!missingItems.length) return { ok: true, missingStockItems: [] };

  if (!options.createMissingStockItems) {
    return {
      ok: false,
      missingStockItems: missingItems.map((item) => item.name),
      error: `Missing Tally stock item(s): ${missingItems.map((item) => item.name).join(", ")}. Create/sync these stock items in Tally or tick "Create missing stock items" and retry.`,
    };
  }

  const createXml = stockItemsToTallyXml(missingItems, options.stockGroupName || "Primary");
  const response = await postToTally(createXml, "create missing stock items");
  if (!isSuccessfulTallyImport(response)) {
    return {
      ok: false,
      missingStockItems: missingItems.map((item) => item.name),
      error: `Tally did not confirm stock item creation. Response: ${response}`,
    };
  }

  return { ok: true, missingStockItems: missingItems.map((item) => item.name) };
}

async function fetchTallyStockItemNames() {
  const response = await postToTally(tallyExportXml("stock item fetch"), "stock item precheck");
  const root = parseTallyXml(response);
  const names = new Set<string>();

  for (const item of collectNodes(root, "STOCKITEM")) {
    const name = getName(item);
    if (name) names.add(normalizeName(name));
  }

  for (const item of collectNodes(root, "DSPACCNAME")) {
    const name = nodeText(item.DSPDISPNAME) || getName(item);
    if (name) names.add(normalizeName(name));
  }

  return names;
}

function uniqueMissingItems(items: LineItem[], existing: Set<string>) {
  const missing = new Map<string, { name: string; unit: string }>();
  for (const item of items) {
    const name = String(item.description || "").trim();
    if (!name || existing.has(normalizeName(name))) continue;
    const key = normalizeName(name);
    if (!missing.has(key)) missing.set(key, { name, unit: item.unit || "Nos" });
  }
  return [...missing.values()];
}

function getName(node: Record<string, unknown>) {
  return nodeText(node.NAME) || String(node.NAME ?? "");
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isSuccessfulTallyImport(response: string) {
  return parseTallyImportResult(response).ok;
}

function parseTallyImportResult(response: string) {
  const lineError = tagText(response, "LINEERROR");
  const created = tagNumber(response, "CREATED");
  const altered = tagNumber(response, "ALTERED");
  const errors = tagNumber(response, "ERRORS");
  const exceptions = tagNumber(response, "EXCEPTIONS");
  const cancelled = tagNumber(response, "CANCELLED");
  const lastVoucherId = tagNumber(response, "LASTVCHID");
  const ok = !lineError && (created > 0 || altered > 0) && errors === 0 && exceptions === 0 && cancelled === 0;

  let message = "Tally did not create the voucher.";
  if (lineError) {
    message = lineError;
  } else if (exceptions > 0) {
    message =
      "Tally returned EXCEPTIONS without a LINEERROR. Try Accounting invoice fallback. If inventory billing is required, check exact voucher type, unit names, GST ledgers, discount ledger, and Tally's import exception screen.";
  } else if (created === 0 && altered === 0) {
    message = "Tally accepted the request but created 0 vouchers.";
  }

  return {
    ok,
    message,
    counters: {
      created,
      altered,
      errors,
      exceptions,
      cancelled,
      lastVoucherId,
    },
    lineError,
  };
}

function tagText(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return decodeXml(match?.[1] ?? "").trim();
}

function tagNumber(xml: string, tagName: string) {
  return Number(tagText(xml, tagName) || 0);
}

function decodeXml(value: string) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}
