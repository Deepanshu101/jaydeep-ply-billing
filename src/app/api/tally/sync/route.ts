import { NextResponse } from "next/server";
import {
  asArray,
  collectNodes,
  listNodeNames,
  nodeText,
  parseTallyXml,
  postToTally,
  tallyDataExportXml,
  tallyExportXml,
  tallyInlineSalesItemCollectionXml,
  TallyRequestError,
  type TallyRequestName,
} from "@/lib/tally";
import { createClient } from "@/lib/supabase/server";

type SyncSummary = {
  clients: number;
  products: number;
  rates: number;
  warnings: string[];
  debug: TallyDebugEntry[];
  importStats?: Record<string, unknown>;
  currentStep?: string;
};

type TallyDebugEntry = {
  requestName: string;
  ok: boolean;
  severity?: "ok" | "warning" | "error";
  requestXml: string;
  rawResponsePreview: string;
  parsedRowCount: number;
  expectedNode: string;
  foundNodeNames: string[];
  responseDateRange?: {
    first: string | null;
    last: string | null;
    uniqueDates: number;
  };
  error?: string;
};

type SyncMode = "masters" | "rates";

type SalesItemRateRow = {
  voucherDate: string | null;
  voucherNumber: string;
  partyName: string;
  stockItemName: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
  raw: Record<string, unknown>;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const fromDate = String(body.from_date || process.env.TALLY_SYNC_FROM || "2025-04-01");
  const toDate = String(body.to_date || process.env.TALLY_SYNC_TO || "2027-03-31");
  const syncMode: SyncMode = body.sync_mode === "rates" ? "rates" : "masters";

  const { data: run, error: runError } = await supabase
    .from("tally_sync_runs")
    .insert({ sync_type: syncMode === "rates" ? "sales_rate_history" : "client_product_masters", from_date: fromDate, to_date: toDate, status: "running" })
    .select("id")
    .single();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  const summary: SyncSummary = { clients: 0, products: 0, rates: 0, warnings: [], debug: [] };

  try {
    if (syncMode === "rates") {
      await updateRunProgress(supabase, run.id, "fetching JP_SALES_EXPORT_REPORT", summary);
      const salesItems = await fetchSalesItemRateReportsByMonth(fromDate, toDate);
      summary.debug.push(...salesItems.debug);
      if (!salesItems.ok) {
        summary.warnings.push(
          salesItems.debug.find((entry) => entry.error)?.error ||
            "Rate history pending custom TDL report: install JP_SALES_EXPORT_REPORT in Tally, then run Sales Rate History again.",
        );
      } else {
        summary.rates = await syncSalesItemRates(supabase, salesItems.rows, fromDate, toDate);
        summary.importStats = {
          ...(summary.importStats ?? {}),
          rates: {
            tallyRowsFound: salesItems.rows.length,
            segmentsFetched: salesItems.segmentsFetched,
            firstVoucherDate: salesItems.firstVoucherDate,
            lastVoucherDate: salesItems.lastVoucherDate,
          },
        };
      }

      await finishRun(supabase, run.id, summary);
      return NextResponse.json({ ok: true, run_id: run.id, summary });
    }

    await updateRunProgress(supabase, run.id, "fetching clients", summary);
    const ledger = await fetchTallyReport("client ledger fetch", "LEDGER", fromDate, toDate);
    summary.debug.push(ledger.debug);
    if (!ledger.ok) throw new Error(ledger.debug.error);
    const clientSync = await syncLedgers(supabase, ledger.root);
    summary.clients = clientSync.count;
    summary.importStats = { ...(summary.importStats ?? {}), clients: clientSync };

    await updateRunProgress(supabase, run.id, "fetching products", summary);
    const stock = await fetchTallyReport("stock item fetch", "STOCKITEM", fromDate, toDate);
    summary.debug.push(stock.debug);
    if (!stock.ok) throw new Error(stock.debug.error);
    const productSync = await syncStockItems(supabase, stock.root);
    summary.products = productSync.count;
    summary.importStats = { ...(summary.importStats ?? {}), products: productSync };

    await finishRun(supabase, run.id, summary);

    return NextResponse.json({ ok: true, run_id: run.id, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tally sync failed.";
    await supabase
      .from("tally_sync_runs")
      .update({ status: "failed", error: message, raw_summary: summary, completed_at: new Date().toISOString() })
      .eq("id", run.id);
    return NextResponse.json({ error: message, run_id: run.id, summary }, { status: 500 });
  }
}

async function finishRun(supabase: Awaited<ReturnType<typeof createClient>>, runId: string, summary: SyncSummary) {
  summary.currentStep = "completed";
  await supabase
    .from("tally_sync_runs")
    .update({
      status: "completed",
      clients_imported: summary.clients,
      products_imported: summary.products,
      rates_imported: summary.rates,
      raw_summary: summary,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

async function updateRunProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  runId: string,
  currentStep: string,
  summary: SyncSummary,
) {
  summary.currentStep = currentStep;
  await supabase
    .from("tally_sync_runs")
    .update({
      status: "running",
      clients_imported: summary.clients,
      products_imported: summary.products,
      rates_imported: summary.rates,
      raw_summary: summary,
    })
    .eq("id", runId);
}

async function fetchTallyReport(requestName: TallyRequestName, expectedNode: string, fromDate: string, toDate: string) {
  const requestXml = tallyExportXml(requestName, fromDate, toDate);
  try {
    const rawResponse = await postToTally(requestXml, requestName);
    const root = parseTallyXml(rawResponse);
    const rows = collectNodes(root, expectedNode);
    const alternateRows = alternateRowsForReport(root, expectedNode);
    const parsedRowCount = rows.length || alternateRows.length;
    const foundNodeNames = listNodeNames(root);
    const debug: TallyDebugEntry = {
      requestName,
      ok: parsedRowCount > 0,
      severity: parsedRowCount > 0 ? "ok" : noVoucherSalesSummary(requestName, expectedNode, foundNodeNames) ? "warning" : "error",
      requestXml,
      rawResponsePreview: preview(rawResponse),
      parsedRowCount,
      expectedNode,
      foundNodeNames,
      responseDateRange: responseDateRange(rawResponse),
    };
    if (!parsedRowCount) {
      debug.error = noVoucherSalesSummary(requestName, expectedNode, foundNodeNames)
        ? "Tally returned the sales report shell/summary, but no item-level VOUCHER rows."
        : `${requestName}: expected node ${expectedNode} not found. Found nodes: ${foundNodeNames.slice(0, 40).join(", ") || "none"}`;
    }
    return { ok: parsedRowCount > 0, root, debug };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${requestName} failed.`;
    const rawResponse = error instanceof TallyRequestError ? error.responseBody : "";
    let foundNodeNames: string[] = [];
    let parsedRowCount = 0;

    if (rawResponse) {
      try {
        const parsed = parseTallyXml(rawResponse);
        foundNodeNames = listNodeNames(parsed);
        parsedRowCount = collectNodes(parsed, expectedNode).length;
      } catch {
        foundNodeNames = [];
      }
    }

    const debug: TallyDebugEntry = {
      requestName,
      ok: false,
      severity: "error",
      requestXml,
      rawResponsePreview: rawResponse ? preview(rawResponse) : "",
      parsedRowCount,
      expectedNode,
      foundNodeNames,
      responseDateRange: rawResponse ? responseDateRange(rawResponse) : undefined,
      error: message,
    };
    return { ok: false, root: null, debug };
  }
}

async function fetchSalesItemRateReportsByMonth(fromDate: string, toDate: string) {
  const segments = monthSegments(fromDate, toDate);
  const debug: TallyDebugEntry[] = [];
  const rows: SalesItemRateRow[] = [];
  const warnings: string[] = [];

  for (const segment of segments) {
    const result = await fetchSalesItemRateReport(segment.from, segment.to);
    debug.push({
      ...result.debug,
      requestName: `sales item rate fetch ${segment.from} to ${segment.to}`,
    });

    if (result.ok) {
      rows.push(...result.rows);
    } else if (result.debug.error) {
      warnings.push(`${segment.from} to ${segment.to}: ${result.debug.error}`);
    }
  }

  const uniqueRows = dedupeSalesRows(rows);
  const dates = uniqueRows.map((row) => row.voucherDate).filter((date): date is string => Boolean(date)).sort();
  const ok = uniqueRows.length > 0;

  if (!ok && debug.length) {
    debug[0].error = warnings[0] || debug[0].error;
  }

  return {
    ok,
    rows: uniqueRows,
    debug,
    segmentsFetched: segments.length,
    firstVoucherDate: dates[0] ?? null,
    lastVoucherDate: dates[dates.length - 1] ?? null,
  };
}

async function fetchSalesItemRateReport(fromDate: string, toDate: string) {
  const requestName: TallyRequestName = "sales item rate fetch";
  const requestXml = tallyExportXml(requestName, fromDate, toDate);
  const fallbackRequestXml = tallyDataExportXml("JP_SALES_EXPORT_REPORT", fromDate, toDate);
  const inlineCollectionRequestXml = tallyInlineSalesItemCollectionXml(fromDate, toDate);
  const attemptedResponses: string[] = [];
  try {
    const rawResponse = await postSalesRateRequestWithFallback(
      requestXml,
      fallbackRequestXml,
      inlineCollectionRequestXml,
      requestName,
      attemptedResponses,
    );
    const root = parseTallyXml(rawResponse);
    const rows = extractSalesItemRows(root);
    const foundNodeNames = listNodeNames(root);
    const debug: TallyDebugEntry = {
      requestName,
      ok: rows.length > 0,
      severity: rows.length > 0 ? "ok" : "warning",
      requestXml,
      rawResponsePreview: preview(attemptedResponses.join("\n\n--- fallback response ---\n\n") || rawResponse),
      parsedRowCount: rows.length,
      expectedNode: "VoucherDate, VoucherNumber, PartyName, StockItemName, Quantity, Unit, Rate, Amount",
      foundNodeNames,
      responseDateRange: responseDateRange(rawResponse),
    };
    if (!rows.length) {
      debug.error =
        emptyEnvelope(rawResponse)
          ? "JP_SALES_EXPORT_REPORT was reachable but returned an empty envelope. Check that the TDL report exports voucher rows for the selected date range."
          : "Rate history pending custom TDL report: Tally did not return JP_SALES_EXPORT_REPORT rows. Install/enable the custom report in Tally and retry Sales Rate History.";
    }
    return { ok: rows.length > 0, rows, debug };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sales item rate fetch failed.";
    const rawResponse = error instanceof TallyRequestError ? error.responseBody : "";
    let foundNodeNames: string[] = [];
    if (rawResponse) {
      try {
        foundNodeNames = listNodeNames(parseTallyXml(rawResponse));
      } catch {
        foundNodeNames = [];
      }
    }
    const debug: TallyDebugEntry = {
      requestName,
      ok: false,
      severity: "warning",
      requestXml,
      rawResponsePreview: attemptedResponses.length
        ? preview(attemptedResponses.join("\n\n--- fallback response ---\n\n"))
        : rawResponse
          ? preview(rawResponse)
          : "",
      parsedRowCount: 0,
      expectedNode: "VoucherDate, VoucherNumber, PartyName, StockItemName, Quantity, Unit, Rate, Amount",
      foundNodeNames,
      responseDateRange: rawResponse ? responseDateRange(rawResponse) : undefined,
      error:
        message.includes("not accepted") || message.includes("no report")
          ? "Rate history pending custom TDL report: JP_SALES_EXPORT_REPORT is not available in Tally or the export envelope is not accepted."
          : message,
    };
    return { ok: false, rows: [], debug };
  }
}

async function postSalesRateRequestWithFallback(
  requestXml: string,
  fallbackRequestXml: string,
  inlineCollectionRequestXml: string,
  requestName: TallyRequestName,
  attemptedResponses: string[],
) {
  try {
    const rawResponse = await postToTally(requestXml, requestName);
    attemptedResponses.push(rawResponse);
    if (!emptyEnvelope(rawResponse)) return rawResponse;
  } catch (error) {
    if (!(error instanceof TallyRequestError)) throw error;
    if (error.responseBody) attemptedResponses.push(error.responseBody);
  }

  try {
    const fallbackResponse = await postToTally(fallbackRequestXml, `${requestName} fallback`);
    attemptedResponses.push(fallbackResponse);
    if (!emptyEnvelope(fallbackResponse)) return fallbackResponse;
  } catch (error) {
    if (!(error instanceof TallyRequestError)) throw error;
    if (error.responseBody) attemptedResponses.push(error.responseBody);
  }

  const inlineResponse = await postToTally(inlineCollectionRequestXml, `${requestName} inline collection fallback`);
  attemptedResponses.push(inlineResponse);
  return inlineResponse;
}

async function syncLedgers(supabase: Awaited<ReturnType<typeof createClient>>, root: unknown) {
  const ledgers = collectNodes(root, "LEDGER");
  const existingCustomers = await loadExistingIds(supabase, "customers");
  const errors: string[] = [];
  let debtorLedgers = 0;
  let addressesImported = 0;
  let count = 0;
  for (const ledger of ledgers) {
    const name = getName(ledger);
    const group = nodeText(ledger.PARENT);
    if (!name || !isClientLedger(group)) continue;
    debtorLedgers += 1;
    const address = extractLedgerAddress(ledger);
    if (address) addressesImported += 1;
    const gst = nodeText(ledger.GSTIN) || nodeText(ledger.PARTYGSTIN);
    const phone = nodeText(ledger.LEDGERPHONE) || nodeText(ledger.LEDGERMOBILE);
    const email = nodeText(ledger.EMAIL);

    const id = existingCustomers.get(normalizeDbName(name));
    const payload = {
        name,
        address: address || null,
        gst_number: gst || null,
        phone: phone || null,
        email: email || null,
      };

    const result = id
      ? await supabase.from("customers").update(payload).eq("id", id).select("id").single()
      : await supabase.from("customers").insert(payload).select("id").single();

    if (!result.error) {
      existingCustomers.set(normalizeDbName(name), result.data.id);
      count += 1;
    } else if (errors.length < 10) {
      errors.push(`${name}: ${result.error.message}`);
    }
  }
  return {
    count,
    tallyLedgersFound: ledgers.length,
    debtorLedgersFound: debtorLedgers,
    addressesImported,
    existingCustomersBeforeSync: existingCustomers.size,
    errors,
  };
}

function extractLedgerAddress(ledger: Record<string, unknown>) {
  const lines = [
    ...collectTextByKey(ledger, "ADDRESS"),
    nodeText(ledger.LEDGERADDRESS),
    nodeText(ledger.MAILINGADDRESS),
    nodeText(ledger.PINCODE) ? `PIN: ${nodeText(ledger.PINCODE)}` : "",
  ]
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return [...new Set(lines)].slice(0, 6).join(", ");
}

function collectTextByKey(value: unknown, wantedKey: string): string[] {
  const found: string[] = [];
  collectTextByKeyInto(value, wantedKey.toUpperCase(), found);
  return found;
}

function collectTextByKeyInto(value: unknown, wantedKey: string, found: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectTextByKeyInto(item, wantedKey, found));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.toUpperCase() === wantedKey) {
      if (Array.isArray(child)) {
        child.map(nodeText).filter(Boolean).forEach((text) => found.push(text));
      } else {
        const text = nodeText(child);
        if (text) found.push(text);
      }
    }
    collectTextByKeyInto(child, wantedKey, found);
  }
}

async function syncStockItems(supabase: Awaited<ReturnType<typeof createClient>>, root: unknown) {
  const items = collectNodes(root, "STOCKITEM");
  if (!items.length) return syncStockSummaryItems(supabase, root);

  const existingProducts = await loadExistingIds(supabase, "products");
  const errors: string[] = [];
  let count = 0;
  for (const item of items) {
    const name = getName(item);
    if (!name) continue;
    const baseRate = numberFromTally(nodeText(item.BASEUNITSRATE) || nodeText(item.STANDARDCOST) || nodeText(item.STANDARDPRICE));
    const unit = nodeText(item.BASEUNITS) || nodeText(item.ADDITIONALUNITS) || "Nos";
    const id = existingProducts.get(normalizeDbName(name));
    const payload = {
        name,
        unit,
        base_rate: baseRate || null,
        notes: "Imported from TallyPrime stock item sync",
        is_active: true,
      };
    const result = id
      ? await supabase.from("products").update(payload).eq("id", id).select("id").single()
      : await supabase.from("products").insert(payload).select("id").single();
    if (!result.error) {
      existingProducts.set(normalizeDbName(name), result.data.id);
      count += 1;
    } else if (errors.length < 10) {
      errors.push(`${name}: ${result.error.message}`);
    }
  }
  return {
    count,
    tallyItemsFound: items.length,
    existingProductsBeforeSync: existingProducts.size,
    errors,
  };
}

async function syncStockSummaryItems(supabase: Awaited<ReturnType<typeof createClient>>, root: unknown) {
  const names = collectNodes(root, "DSPACCNAME");
  const stockInfo = collectNodes(root, "DSPSTKINFO");
  const existingProducts = await loadExistingIds(supabase, "products");
  const errors: string[] = [];
  let count = 0;

  for (let index = 0; index < names.length; index += 1) {
    const name = nodeText(names[index].DSPDISPNAME) || getName(names[index]);
    if (!name) continue;

    const closing = stockInfo[index]?.DSPSTKCL as Record<string, unknown> | undefined;
    const qtyText = nodeText(closing?.DSPCLQTY);
    const rate = numberFromTally(nodeText(closing?.DSPCLRATE));
    const unit = unitFromQty(qtyText) || "Nos";

    const id = existingProducts.get(normalizeDbName(name));
    const payload = {
        name,
        unit,
        base_rate: rate || null,
        notes: "Imported from TallyPrime Stock Summary sync",
        is_active: true,
      };
    const result = id
      ? await supabase.from("products").update(payload).eq("id", id).select("id").single()
      : await supabase.from("products").insert(payload).select("id").single();
    if (!result.error) {
      existingProducts.set(normalizeDbName(name), result.data.id);
      count += 1;
    } else if (errors.length < 10) {
      errors.push(`${name}: ${result.error.message}`);
    }
  }

  return {
    count,
    tallyItemsFound: names.length,
    existingProductsBeforeSync: existingProducts.size,
    errors,
  };
}

async function syncSalesItemRates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: SalesItemRateRow[],
  fromDate: string,
  toDate: string,
) {
  await supabase
    .from("product_rate_history")
    .delete()
    .eq("source", "tally_sales_item_export")
    .gte("voucher_date", fromDate)
    .lte("voucher_date", toDate);

  let count = 0;
  const latestByProduct = new Map<string, { rate: number; date: string }>();

  for (const row of rows) {
    if (!row.stockItemName) continue;
    const productId = await ensureProductId(supabase, row.stockItemName, row.unit, row.rate);
    const customerId = row.partyName ? await findCustomerId(supabase, row.partyName) : null;
    const { error } = await supabase.from("product_rate_history").insert({
      product_id: productId,
      customer_id: customerId,
      source: "tally_sales_item_export",
      voucher_no: row.voucherNumber || null,
      voucher_date: row.voucherDate,
      party_name: row.partyName || null,
      item_name: row.stockItemName,
      qty: row.quantity,
      unit: row.unit,
      rate: row.rate,
      amount: row.amount,
      raw_payload: row.raw,
    });
    if (!error) {
      count += 1;
      if (productId && row.rate && row.voucherDate) {
        const current = latestByProduct.get(productId);
        if (!current || row.voucherDate >= current.date) latestByProduct.set(productId, { rate: row.rate, date: row.voucherDate });
      }
    }
  }

  for (const [productId, latest] of latestByProduct.entries()) {
    await supabase.from("products").update({ base_rate: latest.rate }).eq("id", productId);
  }

  return count;
}

function getName(node: Record<string, unknown>) {
  return nodeText(node.NAME) || nodeText(node["NAME.LIST"]) || nodeText((node as { NAME?: unknown }).NAME) || String(node.NAME ?? "");
}

function isClientLedger(group: string) {
  const normalized = group.toLowerCase();
  return normalized.includes("sundry debtors") || normalized.includes("customer") || normalized.includes("debtors");
}

async function findCustomerId(supabase: Awaited<ReturnType<typeof createClient>>, name: string) {
  const { data } = await supabase.from("customers").select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
}

async function findProductId(supabase: Awaited<ReturnType<typeof createClient>>, name: string) {
  const { data } = await supabase.from("products").select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
}

async function ensureProductId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  unit: string | null,
  rate: number | null,
) {
  const existing = await findProductId(supabase, name);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("products")
    .insert({
      name,
      unit: unit || "Nos",
      base_rate: rate,
      notes: "Created from JP_SALES_EXPORT_REPORT rate sync",
      is_active: true,
    })
    .select("id")
    .single();
  return error ? null : data.id;
}

async function loadExistingIds(supabase: Awaited<ReturnType<typeof createClient>>, table: "customers" | "products") {
  const data: { id: string; name: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase.from(table).select("id, name").range(from, from + 999);
    data.push(...((page ?? []) as { id: string; name: string }[]));
    if (!page || page.length < 1000) break;
  }
  const map = new Map<string, string>();
  for (const row of data) {
    map.set(normalizeDbName(row.name), row.id);
  }
  return map;
}

function normalizeDbName(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function numberFromTally(value: string) {
  const cleaned = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return cleaned ? Math.abs(Number(cleaned[0])) : null;
}

function unitFromQty(value: string) {
  return value.replace(/-?\d+(?:\.\d+)?/g, "").trim();
}

function tallyDateToIso(value: string) {
  if (!/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function monthSegments(fromDate: string, toDate: string) {
  const start = parseIsoDate(fromDate);
  const end = parseIsoDate(toDate);
  if (!start || !end || start > end) return [{ from: fromDate, to: toDate }];

  const segments: { from: string; to: string }[] = [];
  let cursor = new Date(start);
  cursor.setDate(1);

  while (cursor <= end) {
    const segmentStart = new Date(Math.max(start.getTime(), cursor.getTime()));
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const segmentEnd = new Date(Math.min(end.getTime(), nextMonth.getTime() - 24 * 60 * 60 * 1000));
    segments.push({ from: isoDate(segmentStart), to: isoDate(segmentEnd) });
    cursor = nextMonth;
  }

  return segments;
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function preview(value: string) {
  return value.length > 4000 ? `${value.slice(0, 4000)}\n...[truncated ${value.length - 4000} chars]` : value;
}

function alternateRowsForReport(root: unknown, expectedNode: string) {
  if (expectedNode === "STOCKITEM") return collectNodes(root, "DSPACCNAME");
  return [];
}

function responseDateRange(xml: string) {
  const dates = [...new Set([...xml.matchAll(/<DATE(?:\s[^>]*)?>(\d{8})<\/DATE>/g)].map((match) => match[1]))].sort();
  return {
    first: dates[0] ? tallyDateToIso(dates[0]) : null,
    last: dates[dates.length - 1] ? tallyDateToIso(dates[dates.length - 1]) : null,
    uniqueDates: dates.length,
  };
}

function emptyEnvelope(xml: string) {
  return xml.replace(/\s+/g, "").toUpperCase() === "<ENVELOPE></ENVELOPE>";
}

function noVoucherSalesSummary(requestName: TallyRequestName, expectedNode: string, foundNodeNames: string[]) {
  return (
    requestName === "sales voucher/rate fetch" &&
    expectedNode === "VOUCHER" &&
    foundNodeNames.includes("COMPANY") &&
    foundNodeNames.includes("TALLYMESSAGE") &&
    !foundNodeNames.includes("VOUCHER")
  );
}

function extractSalesItemRows(root: unknown) {
  const rows = extractVoucherInventoryRows(root);
  if (rows.length) return rows;

  const flatRows: SalesItemRateRow[] = [];
  collectSalesItemRows(root, flatRows);
  return dedupeSalesRows(flatRows);
}

function dedupeSalesRows(rows: SalesItemRateRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [
      row.voucherDate,
      row.voucherNumber,
      row.partyName,
      row.stockItemName,
      row.quantity,
      row.unit,
      row.rate,
      row.amount,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractVoucherInventoryRows(root: unknown) {
  const vouchers = collectNodes(root, "VOUCHER");
  const rows: SalesItemRateRow[] = [];

  for (const voucher of vouchers) {
    const voucherType = nodeText(voucher.VOUCHERTYPENAME).toLowerCase();
    if (voucherType && !voucherType.includes("sales")) continue;
    const voucherDate = parseTallyDate(nodeText(voucher.DATE) || nodeText(voucher.VOUCHERDATE));
    const voucherNumber = nodeText(voucher.VOUCHERNUMBER) || nodeText(voucher.VOUCHERNO) || nodeText(voucher.REFERENCE);
    const partyName = nodeText(voucher.PARTYLEDGERNAME) || nodeText(voucher.PARTYNAME);
    const entries = [
      ...asArray(voucher["ALLINVENTORYENTRIES.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined),
      ...asArray(voucher["INVENTORYENTRIES.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined),
    ];

    for (const entry of entries) {
      const stockItemName = nodeText(entry.STOCKITEMNAME);
      if (!stockItemName) continue;
      const quantityText = nodeText(entry.BILLEDQTY) || nodeText(entry.ACTUALQTY) || nodeText(entry.QUANTITY);
      rows.push({
        voucherDate,
        voucherNumber,
        partyName,
        stockItemName,
        quantity: numberFromTally(quantityText),
        unit: unitFromQty(quantityText) || nodeText(entry.UNIT) || null,
        rate: numberFromTally(nodeText(entry.RATE)),
        amount: numberFromTally(nodeText(entry.AMOUNT)),
        raw: { voucher, entry },
      });
    }
  }

  return rows;
}

function collectSalesItemRows(value: unknown, rows: SalesItemRateRow[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSalesItemRows(item, rows));
    return;
  }
  if (!value || typeof value !== "object") return;

  const node = value as Record<string, unknown>;
  const stockItemName = pickText(node, ["StockItemName", "Stock Item Name", "STOCKITEMNAME", "ItemName", "ITEMNAME"]);
  const rateText = pickText(node, ["Rate", "RATE", "SellingRate", "SELLINGRATE"]);
  const amountText = pickText(node, ["Amount", "AMOUNT"]);
  const voucherNumber = pickText(node, ["VoucherNumber", "Voucher No", "VOUCHERNUMBER", "VOUCHERNO"]);
  const partyName = pickText(node, ["PartyName", "Party Name", "PARTYNAME", "PartyLedgerName", "PARTYLEDGERNAME"]);

  if (stockItemName && (rateText || amountText || voucherNumber || partyName)) {
    const quantityText = pickText(node, ["Quantity", "Qty", "QUANTITY", "QTY", "BilledQty", "BILLEDQTY"]);
    rows.push({
      voucherDate: parseTallyDate(pickText(node, ["VoucherDate", "Voucher Date", "VOUCHERDATE", "Date", "DATE"])),
      voucherNumber,
      partyName,
      stockItemName,
      quantity: numberFromTally(quantityText),
      unit: pickText(node, ["Unit", "UNIT"]) || unitFromQty(quantityText) || null,
      rate: numberFromTally(rateText),
      amount: numberFromTally(amountText),
      raw: node,
    });
  }

  Object.values(node).forEach((child) => collectSalesItemRows(child, rows));
}

function pickText(node: Record<string, unknown>, names: string[]) {
  const wanted = new Set(names.map(normalizeFieldName));
  for (const [key, value] of Object.entries(node)) {
    if (wanted.has(normalizeFieldName(key))) return nodeText(value).trim();
  }
  return "";
}

function normalizeFieldName(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function parseTallyDate(value: string) {
  if (/^\d{8}$/.test(value)) return tallyDateToIso(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
