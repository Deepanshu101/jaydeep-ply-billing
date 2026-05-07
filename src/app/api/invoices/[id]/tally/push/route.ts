import { NextResponse } from "next/server";
import {
  collectNodes,
  invoiceToTallyXml,
  invoiceToTallyXmlFromTemplate,
  ledgersToTallyXml,
  nodeText,
  parseTallyXml,
  postToTally,
  stockItemsToTallyXml,
  tallyExportXml,
  tallyListOfAccountsXml,
  tallySalesVoucherTemplateProbeXml,
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
  invoice.invoice_items = await applySyncedTallyItems(supabase, invoice.invoice_items ?? []);
  const extendedOptions = options as TallyInvoiceOptions & { preflightOnly?: boolean };
  const preflightOnly = Boolean(extendedOptions.preflightOnly);
  const readiness = await checkTallyReadiness(invoice, options);
  const effectiveOptionsBase = {
    ...options,
    godownName: readiness.checked?.resolvedGodownName || options.godownName,
  };
  const availableLedgerNames = await fetchTallyLedgerList();
  const effectiveOptions = resolveTaxOptions(invoice, effectiveOptionsBase, availableLedgerNames);

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

  if (readiness.godownIssue) {
    return NextResponse.json(
      {
        ok: false,
        error: readiness.godownIssue,
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
  const stockCheck = options.accountingMode ? { ok: true, missingStockItems: [] as string[] } : await ensureInvoiceStockItems(invoice, effectiveOptions);
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
    const pushResult = await pushInvoiceWithCompatibleXml(
      invoice,
      effectiveOptions,
      data.invoice_no,
      new Set(availableLedgerNames.map((name) => normalizeName(name))),
    );

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
    const fallbackXml = invoiceToTallyXml(invoice, effectiveOptions);
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

async function pushInvoiceWithCompatibleXml(
  invoice: Invoice,
  options: TallyInvoiceOptions,
  invoiceNo: string,
  availableLedgerNames: Set<string>,
) {
  const attemptedVariants: { name: string; ok: boolean; message: string; counters?: Record<string, number> }[] = [];
  let lastXml = "";
  let lastResponse = "";
  let lastResult = parseTallyImportResult("");

  if (!options.accountingMode) {
    try {
      let templateExport = "";
      try {
        templateExport = await postToTally(
          tallySalesVoucherTemplateProbeXml(options.voucherTypeName || "Sales GST", invoice.invoice_date),
          "sales voucher template fetch (same date)",
        );
        invoiceToTallyXmlFromTemplate(templateExport, invoice, options);
      } catch {
        templateExport = await postToTally(
          tallySalesVoucherTemplateProbeXml(
            options.voucherTypeName || "Sales GST",
            fiscalYearStart(invoice.invoice_date),
            invoice.invoice_date,
          ),
          "sales voucher template fetch (fiscal range)",
        );
      }
      const templateXml = invoiceToTallyXmlFromTemplate(templateExport, invoice, options);
      const templateResponse = await postToTally(templateXml, `invoice push ${invoiceNo} stock invoice - live template clone`);
      const templateResult = parseTallyImportResult(templateResponse);
      attemptedVariants.push({
        name: "stock invoice - live template clone",
        ok: templateResult.ok,
        message: templateResult.message,
        counters: templateResult.counters,
      });
      lastXml = templateXml;
      lastResponse = templateResponse;
      lastResult = templateResult;
      if (templateResult.ok) {
        return {
          requestXml: templateXml,
          response: templateResponse,
          tallyResult: templateResult,
          attemptedVariants,
          successfulVariant: "stock invoice - live template clone",
          fallbackUsed: false,
        };
      }
    } catch (error) {
      attemptedVariants.push({
        name: "stock invoice - live template clone",
        ok: false,
        message: error instanceof Error ? error.message : "Template-based stock invoice push failed.",
      });
    }
  }

  const hasStandardTaxLedgers =
    availableLedgerNames.has(normalizeName("CGST")) && availableLedgerNames.has(normalizeName("SGST"));
  const taxLedgerVariant =
    Number(invoice.cgst || 0) > 0 || Number(invoice.sgst || 0) > 0
      ? {
          gstThroughSalesLedger: false,
          cgstLedgerName: hasStandardTaxLedgers ? "CGST" : options.cgstLedgerName,
          sgstLedgerName: hasStandardTaxLedgers ? "SGST" : options.sgstLedgerName,
        }
      : null;

  const variants = options.accountingMode
    ? [{ name: "accounting invoice", options }]
    : [
        ...(taxLedgerVariant
          ? [
              {
                name: "stock invoice - invoice view with separate CGST/SGST ledgers",
                options: {
                  ...options,
                  ...taxLedgerVariant,
                  inventoryQtySign: "negative" as const,
                  stockXmlMode: "invoice-batch" as const,
                },
              },
              {
                name: "stock invoice - invoice view no batch with separate CGST/SGST ledgers",
                options: {
                  ...options,
                  ...taxLedgerVariant,
                  inventoryQtySign: "negative" as const,
                  stockXmlMode: "invoice-no-batch" as const,
                },
              },
            ]
          : []),
        {
          name: "stock invoice - official sample envelope with batch",
          options: {
            ...options,
            inventoryQtySign: "positive" as const,
            stockXmlMode: "invoice-batch" as const,
            voucherEnvelopeMode: "sample-data" as const,
          },
        },
        {
          name: "stock invoice - official sample envelope without batch",
          options: {
            ...options,
            inventoryQtySign: "positive" as const,
            stockXmlMode: "invoice-no-batch" as const,
            voucherEnvelopeMode: "sample-data" as const,
          },
        },
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

async function applySyncedTallyItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: LineItem[],
) {
  if (!items.length) return items;
  const catalog = await loadProductCatalog(supabase);
  return items.map((item) => {
    const matched = matchCatalogItem(item.description, catalog);
    if (!matched) return item;
    return {
      ...item,
      description: matched.name,
      unit: matched.unit || item.unit,
    };
  });
}

async function checkTallyReadiness(invoice: Invoice, options: TallyInvoiceOptions) {
  const accountingMode = Boolean(options.accountingMode);
  const gstThroughSalesLedger = Boolean(options.gstThroughSalesLedger);
  const [ledgerNames, stockNames, voucherTypes, godowns] = await Promise.all([
    fetchTallyLedgerNames(),
    accountingMode ? Promise.resolve(new Set<string>()) : fetchTallyStockItemNames(),
    accountingMode ? Promise.resolve([] as TallyVoucherTypeInfo[]) : fetchTallyVoucherTypes(),
    accountingMode ? Promise.resolve([] as TallyGodownInfo[]) : fetchTallyGodowns(),
  ]);
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
    !gstThroughSalesLedger && options.isInterstate && taxAmount > 0 ? igstLedgerName : "",
    !gstThroughSalesLedger && !options.isInterstate && Number(invoice.cgst || 0) > 0 ? cgstLedgerName : "",
    !gstThroughSalesLedger && !options.isInterstate && Number(invoice.sgst || 0) > 0 ? sgstLedgerName : "",
    Number(invoice.discount_amount || 0) > 0 && discountLedgerName ? discountLedgerName : "",
    roundOffLedgerName,
  ].filter(Boolean);

  for (const ledger of requiredLedgers) {
    if (!ledgerNames.has(normalizeName(ledger))) missingLedgers.push(ledger);
  }

  const missingPartyLedger = !ledgerNames.has(normalizeName(invoice.client_name));
  const missingStockItems = accountingMode ? [] : uniqueMissingItems(invoice.invoice_items ?? [], stockNames).map((item) => item.name);
  const resolvedGodownName =
    accountingMode ? "" : cleanOption(options.godownName) || (godowns.length === 1 ? godowns[0].name : "");
  const selectedVoucherTypeName = cleanOption(options.voucherTypeName) || process.env.TALLY_SALES_VOUCHER_TYPE || "Sales";
  const selectedVoucherType = accountingMode ? null : voucherTypes.find((voucherType) => normalizeName(voucherType.name) === normalizeName(selectedVoucherTypeName));
  const voucherTypeIssue = accountingMode
    ? ""
    : !selectedVoucherType
      ? `Voucher type '${selectedVoucherTypeName}' was not found in Tally. Pick the exact Tally voucher type before pushing stock invoice.`
      : !selectedVoucherType.isActive
        ? `Voucher type '${selectedVoucherType.name}' is inactive in Tally. Activate it or choose an active stock-enabled voucher type.`
        : !selectedVoucherType.affectsStock
          ? `Voucher type '${selectedVoucherType.name}' is reported by Tally as not affecting stock, but live exported sales vouchers in this company still show inventory rows. We'll warn, not block, and keep comparing against the exported voucher shape.`
          : "";
  const godownIssue =
    accountingMode || !cleanOption(options.godownName)
      ? ""
      : !godowns.some((godown) => normalizeName(godown.name) === normalizeName(options.godownName || ""))
        ? `Godown / location '${options.godownName}' was not found in Tally. Use one of the exact Tally godown names before pushing stock invoice.`
        : "";

  return {
    ok: !missingPartyLedger && !missingLedgers.length && !missingStockItems.length && !godownIssue,
    mode: accountingMode ? "accounting" : "inventory",
    missingPartyLedger,
    missingLedgers,
    missingStockItems,
    voucherTypeIssue,
    godownIssue,
    checked: {
      partyLedger: invoice.client_name,
      salesLedger: salesLedgerName,
      gstThroughSalesLedger,
      taxLedgers: requiredLedgers.filter((ledger) => ledger !== salesLedgerName),
      stockItemCount: invoice.invoice_items?.length ?? 0,
      resolvedGodownName,
      availableGodowns: godowns.map((godown) => godown.name),
      stockEnabledVoucherTypes: voucherTypes.filter((voucherType) => voucherType.affectsStock && voucherType.isActive).map((voucherType) => voucherType.name),
    },
  };
}

async function fetchTallyLedgerNames() {
  const names = await fetchTallyLedgerList();
  return new Set(names.map((name) => normalizeName(name)));
}

async function fetchTallyLedgerList() {
  const response = await postToTally(tallyExportXml("client ledger fetch"), "ledger precheck");
  const root = parseTallyXml(response);
  const names = new Set<string>();
  for (const item of collectNodes(root, "LEDGER")) {
    const name = getName(item);
    if (name) names.add(String(name).trim());
  }
  return [...names];
}

function resolveTaxOptions(invoice: Invoice, options: TallyInvoiceOptions, availableLedgerNames: string[]): TallyInvoiceOptions {
  const needsTaxLedgers =
    !options.accountingMode &&
    !options.isInterstate &&
    (Number(invoice.cgst || 0) > 0 || Number(invoice.sgst || 0) > 0);

  if (!needsTaxLedgers) return options;

  const requestedCgst = cleanOption(options.cgstLedgerName) || process.env.TALLY_CGST_LEDGER || "Output CGST";
  const requestedSgst = cleanOption(options.sgstLedgerName) || process.env.TALLY_SGST_LEDGER || "Output SGST";
  const resolvedCgst = resolveLedgerName(requestedCgst, availableLedgerNames, [
    /^cgst$/i,
    /\bcgst\b/i,
  ]);
  const resolvedSgst = resolveLedgerName(requestedSgst, availableLedgerNames, [
    /^sgst$/i,
    /\bsgst\b/i,
    /\butgst\b/i,
  ]);

  return {
    ...options,
    gstThroughSalesLedger: false,
    cgstLedgerName: resolvedCgst || requestedCgst,
    sgstLedgerName: resolvedSgst || requestedSgst,
  };
}

function resolveLedgerName(requestedName: string, availableLedgerNames: string[], patterns: RegExp[]) {
  const requestedNormalized = normalizeName(requestedName);
  const exact = availableLedgerNames.find((name) => normalizeName(name) === requestedNormalized);
  if (exact) return exact;

  for (const pattern of patterns) {
    const match = availableLedgerNames.find((name) => pattern.test(name));
    if (match) return match;
  }

  return "";
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

type TallyVoucherTypeInfo = {
  name: string;
  parent: string;
  affectsStock: boolean;
  isActive: boolean;
};

type TallyGodownInfo = {
  name: string;
};

async function fetchTallyVoucherTypes() {
  const response = await postToTally(tallyListOfAccountsXml("Voucher Types"), "voucher type precheck");
  const root = parseTallyXml(response);

  return collectNodes(root, "VOUCHERTYPE")
    .map((voucherType) => ({
      name: getName(voucherType),
      parent: nodeText(voucherType.PARENT),
      affectsStock: nodeText(voucherType.AFFECTSSTOCK).toLowerCase() === "yes",
      isActive: nodeText(voucherType.ISACTIVE).toLowerCase() !== "no",
    }))
    .filter((voucherType) => voucherType.name);
}

async function fetchTallyGodowns() {
  const response = await postToTally(tallyListOfAccountsXml("Godowns"), "godown precheck");
  const root = parseTallyXml(response);

  return collectNodes(root, "GODOWN")
    .map((godown) => ({
      name: getName(godown),
    }))
    .filter((godown) => godown.name);
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

function cleanOption(value: string | undefined) {
  return String(value || "").trim();
}

async function loadProductCatalog(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: products }, { data: aliases }] = await Promise.all([
    supabase.from("products").select("id, name, unit").eq("is_active", true),
    supabase.from("product_aliases").select("product_id, alias"),
  ]);

  const productMap = new Map(
    ((products ?? []) as { id: string; name: string; unit: string | null }[]).map((product) => [product.id, product]),
  );
  const index = new Map<string, { id: string; name: string; unit: string }>();

  for (const product of productMap.values()) {
    index.set(normalizeName(product.name), {
      id: product.id,
      name: product.name,
      unit: String(product.unit || "Nos"),
    });
  }

  for (const alias of (aliases ?? []) as { product_id: string; alias: string }[]) {
    const product = productMap.get(alias.product_id);
    if (!product || !alias.alias) continue;
    index.set(normalizeName(alias.alias), {
      id: product.id,
      name: product.name,
      unit: String(product.unit || "Nos"),
    });
  }

  return index;
}

function matchCatalogItem(
  rawName: string,
  catalog: Map<string, { id: string; name: string; unit: string }>,
) {
  const normalized = normalizeName(rawName);
  if (!normalized) return null;
  const exact = catalog.get(normalized);
  if (exact) return exact;

  for (const [key, product] of catalog.entries()) {
    if (key.includes(normalized) || normalized.includes(key)) return product;
  }

  return null;
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
  return String(value || "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[“”"]/g, "")
    .replace(/[×x]/g, " x ")
    .replace(/&/g, " and ")
    .replace(/\bnos?\b/g, " nos ")
    .replace(/\bpcs?\b/g, " nos ")
    .replace(/\bsq\.?\s*ft\b|\bsft\b/g, " sqft ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fiscalYearStart(date: string) {
  const [yearText, monthText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-04-01`;
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
