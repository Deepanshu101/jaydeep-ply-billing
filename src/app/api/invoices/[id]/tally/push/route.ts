import { NextResponse } from "next/server";
import {
  collectNodes,
  invoiceToTallyXml,
  ledgersToTallyXml,
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
  invoice.invoice_items = await applySyncedTallyUnits(supabase, invoice.invoice_items ?? []);
  const extendedOptions = options as TallyInvoiceOptions & { preflightOnly?: boolean };
  const preflightOnly = Boolean(extendedOptions.preflightOnly);
  const readiness = await checkTallyReadiness(invoice, options);

  if (preflightOnly) {
    return NextResponse.json({
      ok: readiness.ok,
      readiness,
      message: readiness.ok ? "Ready for Tally push." : "Fix the missing Tally masters before pushing.",
    });
  }

  if (readiness.missingPartyLedger && options.createMissingPartyLedger) {
    const createPartyResponse = await postToTally(
      ledgersToTallyXml([
        {
          name: invoice.client_name,
          parent: "Sundry Debtors",
          address: invoice.address,
          gstNumber: invoice.gst_number,
        },
      ]),
      "create missing party ledger",
    );
    if (!isSuccessfulTallyImport(createPartyResponse)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Tally did not create party ledger '${invoice.client_name}'. Check Sundry Debtors group and retry.`,
          response: createPartyResponse,
        },
        { status: 400 },
      );
    }
  } else if (readiness.missingPartyLedger) {
    return NextResponse.json(
      {
        ok: false,
        error: `Party ledger '${invoice.client_name}' does not exist in Tally. Tick 'Create client ledger' or create it in Tally first.`,
        readiness,
      },
      { status: 400 },
    );
  }

  if (readiness.missingLedgers.length) {
    return NextResponse.json(
      {
        ok: false,
        error: `Missing Tally ledger(s): ${readiness.missingLedgers.join(", ")}. Select exact Tally ledger names before pushing.`,
        readiness,
      },
      { status: 400 },
    );
  }

  if ((invoice.discount_amount ?? 0) > 0 && !options.accountingMode && !options.discountLedgerName?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This invoice has discount. For stock invoice push, enter a Discount ledger name from Tally.",
      },
      { status: 400 },
    );
  }
  const stockCheck = options.accountingMode ? { ok: true, missingStockItems: [] as string[] } : await ensureInvoiceStockItems(invoice, options);
  if (!stockCheck.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "error" in stockCheck ? stockCheck.error : "Stock item precheck failed.",
        missingStockItems: stockCheck.missingStockItems,
      },
      { status: 400 },
    );
  }

  try {
    const pushResult = await pushInvoiceWithCompatibleXml(invoice, options, data.invoice_no);

    await supabase
      .from("invoices")
      .update({
        tally_sync_status: pushResult.tallyResult.ok ? "synced" : "failed",
        tally_synced_at: pushResult.tallyResult.ok ? new Date().toISOString() : null,
        tally_response: pushResult.response,
        tally_request_xml: pushResult.requestXml,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: pushResult.tallyResult.ok,
      tallyResult: pushResult.tallyResult,
      requestXml: pushResult.requestXml,
      response: pushResult.response,
      attemptedVariants: pushResult.attemptedVariants,
      successfulVariant: pushResult.successfulVariant,
      fallbackUsed: false,
      message: pushResult.tallyResult.ok ? `Invoice pushed to Tally using ${pushResult.successfulVariant}.` : pushResult.tallyResult.message,
    }, { status: pushResult.tallyResult.ok ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tally push failed.";
    const responseBody = error instanceof TallyRequestError ? error.responseBody : "";
    const fallbackXml = invoiceToTallyXml(invoice, options);
    await supabase
      .from("invoices")
      .update({
        tally_sync_status: "failed",
        tally_synced_at: null,
        tally_response: responseBody || message,
        tally_request_xml: fallbackXml,
      })
      .eq("id", id);
    return NextResponse.json({ ok: false, error: friendlyTallyError(message, responseBody, options), requestXml: fallbackXml, response: responseBody }, { status: 500 });
  }
}

async function pushInvoiceWithCompatibleXml(invoice: Invoice, options: TallyInvoiceOptions, invoiceNo: string) {
  const variants = options.accountingMode
    ? [{ name: "accounting invoice", options }]
    : [
        {
          name: "stock invoice - invoice view with godown batch",
          options: { ...options, inventoryQtySign: "negative" as const, stockXmlMode: "invoice-batch" as const },
        },
        {
          name: "stock invoice - invoice view without batch/godown",
          options: { ...options, inventoryQtySign: "negative" as const, stockXmlMode: "invoice-no-batch" as const },
        },
        {
          name: "stock invoice - inventory voucher view with godown batch",
          options: { ...options, inventoryQtySign: "negative" as const, stockXmlMode: "inventory-voucher-batch" as const },
        },
        {
          name: "stock invoice - inventory voucher view without batch/godown",
          options: { ...options, inventoryQtySign: "negative" as const, stockXmlMode: "inventory-voucher-no-batch" as const },
        },
        {
          name: "stock invoice - invoice view positive quantity without batch/godown",
          options: { ...options, inventoryQtySign: "positive" as const, stockXmlMode: "invoice-no-batch" as const },
        },
        {
          name: "stock invoice - inventory entries before party ledger",
          options: {
            ...options,
            inventoryQtySign: "negative" as const,
            stockXmlMode: "invoice-no-batch" as const,
            inventoryEntriesFirst: true,
          },
        },
        {
          name: "stock invoice - no entry mode and no batch/godown",
          options: {
            ...options,
            inventoryQtySign: "positive" as const,
            stockXmlMode: "invoice-no-batch" as const,
            omitVchEntryMode: true,
          },
        },
      ];

  const attemptedVariants: { name: string; ok: boolean; message: string; counters?: Record<string, number> }[] = [];
  let lastXml = "";
  let lastResponse = "";
  let lastResult = parseTallyImportResult("");

  for (const variant of variants) {
    const requestXml = invoiceToTallyXml(invoice, variant.options);
    const response = await postToTally(requestXml, `invoice push ${invoiceNo} ${variant.name}`);
    const tallyResult = parseTallyImportResult(response);
    attemptedVariants.push({
      name: variant.name,
      ok: tallyResult.ok,
      message: tallyResult.message,
      counters: tallyResult.counters,
    });
    lastXml = requestXml;
    lastResponse = response;
    lastResult = tallyResult;
    if (tallyResult.ok) {
      return {
        requestXml,
        response,
        tallyResult,
        attemptedVariants,
        successfulVariant: variant.name,
        fallbackUsed: false,
      };
    }
  }

  return {
    requestXml: lastXml,
    response: lastResponse,
    tallyResult: lastResult,
    attemptedVariants,
    successfulVariant: "",
    fallbackUsed: false,
  };
}

async function applySyncedTallyUnits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: LineItem[],
) {
  if (!items.length) return items;
  const { data } = await supabase.from("products").select("name, unit").in("name", items.map((item) => item.description));
  const units = new Map((data ?? []).map((product) => [normalizeName(String(product.name)), String(product.unit || "")]));

  return items.map((item) => {
    const syncedUnit = units.get(normalizeName(item.description));
    return syncedUnit ? { ...item, unit: syncedUnit } : item;
  });
}

async function checkTallyReadiness(invoice: Invoice, options: TallyInvoiceOptions) {
  const accountingMode = Boolean(options.accountingMode);
  const [ledgerNames, stockNames] = await Promise.all([fetchTallyLedgerNames(), accountingMode ? Promise.resolve(new Set<string>()) : fetchTallyStockItemNames()]);
  const missingLedgers: string[] = [];
  const salesLedgerName = options.salesLedgerName || process.env.TALLY_SALES_LEDGER || "Sales";
  const cgstLedgerName = options.cgstLedgerName || process.env.TALLY_CGST_LEDGER || "Output CGST";
  const sgstLedgerName = options.sgstLedgerName || process.env.TALLY_SGST_LEDGER || "Output SGST";
  const igstLedgerName = options.igstLedgerName || process.env.TALLY_IGST_LEDGER || "Output IGST";
  const discountLedgerName = options.discountLedgerName || "";
  const roundOffLedgerName = options.roundOffLedgerName || "";
  const taxAmount = Number(invoice.cgst || 0) + Number(invoice.sgst || 0);
  const requiredLedgers = [
    salesLedgerName,
    options.isInterstate && taxAmount > 0 ? igstLedgerName : "",
    !options.isInterstate && Number(invoice.cgst || 0) > 0 ? cgstLedgerName : "",
    !options.isInterstate && Number(invoice.sgst || 0) > 0 ? sgstLedgerName : "",
    Number(invoice.discount_amount || 0) > 0 && discountLedgerName ? discountLedgerName : "",
    roundOffLedgerName,
  ].filter(Boolean);

  for (const ledger of requiredLedgers) {
    if (!ledgerNames.has(normalizeName(ledger))) missingLedgers.push(ledger);
  }

  const missingPartyLedger = !ledgerNames.has(normalizeName(invoice.client_name));
  const missingStockItems = accountingMode ? [] : uniqueMissingItems(invoice.invoice_items ?? [], stockNames).map((item) => item.name);

  return {
    ok: !missingPartyLedger && !missingLedgers.length && !missingStockItems.length,
    mode: accountingMode ? "accounting" : "inventory",
    missingPartyLedger,
    missingLedgers,
    missingStockItems,
    checked: {
      partyLedger: invoice.client_name,
      salesLedger: salesLedgerName,
      taxLedgers: requiredLedgers.filter((ledger) => ledger !== salesLedgerName),
      stockItemCount: invoice.invoice_items?.length ?? 0,
    },
  };
}

async function fetchTallyLedgerNames() {
  const response = await postToTally(tallyExportXml("client ledger fetch"), "ledger precheck");
  const root = parseTallyXml(response);
  const names = new Set<string>();
  for (const item of collectNodes(root, "LEDGER")) {
    const name = getName(item);
    if (name) names.add(normalizeName(name));
  }
  return names;
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

  const createXml = stockItemsToTallyXml(missingItems, options.stockGroupName || "");
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
    if (!missing.has(key)) missing.set(key, { name, unit: tallyUnit(item.unit || "Nos") });
  }
  return [...missing.values()];
}

function tallyUnit(value: string) {
  const unit = String(value || "Nos")
    .replace(/\s*=\s*/g, "=")
    .split("=")[0]
    .trim();
  const normalized = unit.toLowerCase();
  if (normalized === "nos" || normalized === "no" || normalized === "pcs" || normalized === "piece") return "Nos";
  if (normalized === "sqft" || normalized === "sq ft" || normalized === "sft") return "sqft";
  if (normalized === "sheet" || normalized === "sheets") return "Sheets";
  return unit || "Nos";
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
      "Tally rejected this stock invoice without a line error. If this invoice number was already pushed as accounting, use Replace existing as stock. Otherwise test with a voucher suffix, then check exact Godown/location, voucher type, and stock item GST setup.";
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

function friendlyTallyError(message: string, responseBody: string, options: TallyInvoiceOptions) {
  const combined = `${message} ${responseBody}`.toLowerCase();
  if (combined.includes("<exceptions>1</exceptions>") && !combined.includes("<lineerror>") && !options.accountingMode) {
    return "Tally rejected the stock invoice without a line error. If this invoice number was already pushed as accounting, use Replace existing as stock. Otherwise test with a voucher suffix, then check exact Godown/location, voucher type, and stock item GST setup.";
  }
  return message;
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
