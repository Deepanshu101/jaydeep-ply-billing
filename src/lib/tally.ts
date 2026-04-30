import { create } from "xmlbuilder2";
import { XMLParser } from "fast-xml-parser";
import { brand } from "./brand";
import { readTallyItemMeta, stripTallyItemMeta } from "./tally-item-meta";
import type { Invoice, LineItem } from "./types";

type XmlNode = {
  ele: (name: string, attrs?: Record<string, string>) => XmlNode;
  txt: (value: string) => XmlNode;
  up: () => XmlNode;
};

export type TallyInvoiceOptions = {
  voucherTypeName?: string;
  salesLedgerName?: string;
  gstThroughSalesLedger?: boolean;
  cgstLedgerName?: string;
  sgstLedgerName?: string;
  igstLedgerName?: string;
  roundOffLedgerName?: string;
  godownName?: string;
  isInterstate?: boolean;
  narration?: string;
  orderReference?: string;
  createMissingStockItems?: boolean;
  stockGroupName?: string;
  discountLedgerName?: string;
  accountingMode?: boolean;
  createMissingPartyLedger?: boolean;
  voucherNumberSuffix?: string;
  inventoryQtySign?: "positive" | "negative";
  omitVchEntryMode?: boolean;
  stockXmlMode?: "invoice-batch" | "invoice-no-batch" | "inventory-voucher-batch" | "inventory-voucher-no-batch";
  inventoryEntriesFirst?: boolean;
  voucherAction?: "Create" | "Alter";
  voucherEnvelopeMode?: "requestdata" | "sample-data";
};

export type TallyStockItemInput = {
  name: string;
  unit: string;
};

export type TallyLedgerInput = {
  name: string;
  parent: string;
  address?: string | null;
  gstNumber?: string | null;
};

export function invoiceToTallyXml(invoice: Invoice, options: TallyInvoiceOptions = {}) {
  const date = invoice.invoice_date.replaceAll("-", "");
  const voucherTypeName = cleanTallyText(options.voucherTypeName || process.env.TALLY_SALES_VOUCHER_TYPE || "Sales");
  const salesLedgerName = cleanTallyText(options.salesLedgerName || process.env.TALLY_SALES_LEDGER || "Sales");
  const gstThroughSalesLedger = Boolean(options.gstThroughSalesLedger);
  const cgstLedgerName = cleanTallyText(options.cgstLedgerName || process.env.TALLY_CGST_LEDGER || "Output CGST");
  const sgstLedgerName = cleanTallyText(options.sgstLedgerName || process.env.TALLY_SGST_LEDGER || "Output SGST");
  const igstLedgerName = cleanTallyText(options.igstLedgerName || process.env.TALLY_IGST_LEDGER || "Output IGST");
  const roundOffLedgerName = cleanTallyText(options.roundOffLedgerName || process.env.TALLY_ROUND_OFF_LEDGER || "");
  const discountLedgerName = cleanTallyText(options.discountLedgerName || process.env.TALLY_DISCOUNT_LEDGER || "");
  const isInterstate = Boolean(options.isInterstate);
  const accountingMode = Boolean(options.accountingMode);
  const stockXmlMode = options.stockXmlMode || "invoice-batch";
  const voucherAction = options.voucherAction || "Create";
  const envelopeMode = options.voucherEnvelopeMode || "requestdata";
  const isInventoryVoucherView = !accountingMode && stockXmlMode.startsWith("inventory-voucher");
  const voucherView = accountingMode
    ? "Accounting Voucher View"
    : isInventoryVoucherView
      ? "Inventory Voucher View"
      : "Invoice Voucher View";
  const entryMode = accountingMode ? "Accounting Invoice" : "Item Invoice";
  const taxAmount = Number(invoice.cgst || 0) + Number(invoice.sgst || 0);
  const subtotal = Number(invoice.subtotal || 0);
  const discountAmount = Number(invoice.discount_amount || 0);
  const taxableSubtotal = round2(subtotal - discountAmount);
  const roundOff = round2(Number(invoice.grand_total || 0) - round2(taxableSubtotal + taxAmount));
  const voucherNumber = cleanTallyText(`${invoice.invoice_no}${options.voucherNumberSuffix || ""}`);
  const root =
    envelopeMode === "sample-data"
      ? create({ version: "1.0", encoding: "UTF-8" })
          .ele("ENVELOPE")
          .ele("HEADER")
          .ele("VERSION")
          .txt("1")
          .up()
          .ele("TALLYREQUEST")
          .txt("Import")
          .up()
          .ele("TYPE")
          .txt("Data")
          .up()
          .ele("ID")
          .txt("Vouchers")
          .up()
          .up()
          .ele("BODY")
          .ele("DESC")
          .up()
          .ele("DATA")
          .ele("TALLYMESSAGE", { "xmlns:UDF": "TallyUDF" })
          .ele(
            "VOUCHER",
            voucherAction === "Alter"
              ? { VCHTYPE: voucherTypeName, ACTION: voucherAction, OBJVIEW: voucherView, DATE: tallyDisplayDate(invoice.invoice_date), TAGNAME: "Voucher Number", TAGVALUE: voucherNumber }
              : { VCHTYPE: voucherTypeName, ACTION: voucherAction, OBJVIEW: voucherView },
          )
      : create({ version: "1.0", encoding: "UTF-8" })
          .ele("ENVELOPE")
          .ele("HEADER")
          .ele("TALLYREQUEST")
          .txt("Import Data")
          .up()
          .up()
          .ele("BODY")
          .ele("IMPORTDATA")
          .ele("REQUESTDESC")
          .ele("REPORTNAME")
          .txt("Vouchers")
          .up()
          .up()
          .ele("REQUESTDATA")
          .ele("TALLYMESSAGE", { "xmlns:UDF": "TallyUDF" })
          .ele(
            "VOUCHER",
            voucherAction === "Alter"
              ? { VCHTYPE: voucherTypeName, ACTION: voucherAction, OBJVIEW: voucherView, DATE: tallyDisplayDate(invoice.invoice_date), TAGNAME: "Voucher Number", TAGVALUE: voucherNumber }
              : { VCHTYPE: voucherTypeName, ACTION: voucherAction, OBJVIEW: voucherView },
          );

  root.ele("DATE").txt(date).up();
  root.ele("EFFECTIVEDATE").txt(date).up();
  root.ele("VOUCHERTYPENAME").txt(voucherTypeName).up();
  root.ele("VOUCHERNUMBER").txt(voucherNumber).up();
  root.ele("REFERENCE").txt(cleanTallyText(options.orderReference || invoice.project_name || invoice.invoice_no)).up();
  root.ele("PARTYLEDGERNAME").txt(cleanTallyText(invoice.client_name)).up();
  root.ele("PARTYNAME").txt(cleanTallyText(invoice.client_name)).up();
  root.ele("BASICBASEPARTYNAME").txt(cleanTallyText(invoice.client_name)).up();
  root.ele("COUNTRYOFRESIDENCE").txt("India").up();
  root.ele("STATENAME").txt(stateNameFromGstin(invoice.gst_number)).up();
  root.ele("PLACEOFSUPPLY").txt(stateNameFromGstin(invoice.gst_number)).up();
  root.ele("GSTREGISTRATIONTYPE").txt(invoice.gst_number ? "Regular" : "Unregistered/Consumer").up();
  root.ele("PERSISTEDVIEW").txt(voucherView).up();
  if (!options.omitVchEntryMode && envelopeMode !== "sample-data") root.ele("VCHENTRYMODE").txt(entryMode).up();
  root.ele("ISINVOICE").txt("Yes").up();
  root.ele("ISDELETED").txt("No").up();
  root.ele("ISOPTIONAL").txt("No").up();
  root.ele("DIFFACTUALQTY").txt("No").up();
  root.ele("ASORIGINAL").txt("No").up();
  root.ele("NARRATION").txt(cleanTallyText(options.narration || `${brand.businessName} invoice for ${invoice.project_name}`)).up();

  root.ele("BASICBUYERNAME").txt(cleanTallyText(invoice.client_name)).up();
  root.ele("BASICBUYERSSALESTAXNO").txt(cleanTallyText(invoice.gst_number || "")).up();
  root.ele("PARTYGSTIN").txt(cleanTallyText(invoice.gst_number || "")).up();
  addAddress(root, "ADDRESS.LIST", invoice.address);
  addAddress(root, "BASICBUYERADDRESS.LIST", invoice.address);

  const addInventoryEntries = () => {
    for (const item of invoice.invoice_items ?? []) {
      inventoryEntry(root, item, salesLedgerName, {
        godownName: options.godownName,
        qtySign: options.inventoryQtySign || "negative",
        includeBatchAllocation: stockXmlMode.endsWith("batch"),
      });
    }
    if (discountAmount > 0 && discountLedgerName) {
      ledger(root, discountLedgerName, discountAmount, false);
    }
  };

  if (!accountingMode && options.inventoryEntriesFirst) {
    addInventoryEntries();
    partyLedger(root, invoice.client_name, invoice.grand_total, envelopeMode);
  } else {
    partyLedger(root, invoice.client_name, invoice.grand_total, envelopeMode);
    if (accountingMode) {
      ledger(root, salesLedgerName, taxableSubtotal, false, envelopeMode);
    } else {
      addInventoryEntries();
    }
  }

  if (!gstThroughSalesLedger) {
    if (isInterstate) {
      if (taxAmount > 0) ledger(root, igstLedgerName, taxAmount, false, envelopeMode);
    } else {
      if (Number(invoice.cgst || 0) > 0) ledger(root, cgstLedgerName, Number(invoice.cgst || 0), false, envelopeMode);
      if (Number(invoice.sgst || 0) > 0) ledger(root, sgstLedgerName, Number(invoice.sgst || 0), false, envelopeMode);
    }
  }

  if (roundOffLedgerName && Math.abs(roundOff) >= 0.01) {
    ledger(root, roundOffLedgerName, roundOff, false, envelopeMode);
  }

  return root.doc().end({ prettyPrint: true });
}

export function stockItemsToTallyXml(items: TallyStockItemInput[], stockGroupName = "") {
  const requestData = create({ version: "1.0", encoding: "UTF-8" })
    .ele("ENVELOPE")
    .ele("HEADER")
    .ele("TALLYREQUEST")
    .txt("Import Data")
    .up()
    .up()
    .ele("BODY")
    .ele("IMPORTDATA")
    .ele("REQUESTDESC")
    .ele("REPORTNAME")
    .txt("All Masters")
    .up()
    .up()
    .ele("REQUESTDATA");

  for (const item of items) {
    const message = requestData.ele("TALLYMESSAGE", { "xmlns:UDF": "TallyUDF" });
    const stockItem = message.ele("STOCKITEM", { NAME: cleanTallyText(item.name), ACTION: "Create" });
    stockItem.ele("NAME").txt(cleanTallyText(item.name)).up();
    if (stockGroupName.trim()) stockItem.ele("PARENT").txt(cleanTallyText(stockGroupName)).up();
    stockItem.ele("BASEUNITS").txt(cleanTallyUnit(item.unit || "Nos")).up();
    stockItem.ele("ISBATCHWISEON").txt("No").up();
    stockItem.ele("ISCOSTCENTRESON").txt("No").up();
    stockItem.ele("ISPERISHABLEON").txt("No").up();
    stockItem.ele("IGNOREPHYSICALDIFFERENCE").txt("No").up();
    stockItem.up();
    message.up();
  }

  return requestData.doc().end({ prettyPrint: true });
}

export function ledgersToTallyXml(ledgers: TallyLedgerInput[]) {
  const requestData = create({ version: "1.0", encoding: "UTF-8" })
    .ele("ENVELOPE")
    .ele("HEADER")
    .ele("TALLYREQUEST")
    .txt("Import Data")
    .up()
    .up()
    .ele("BODY")
    .ele("IMPORTDATA")
    .ele("REQUESTDESC")
    .ele("REPORTNAME")
    .txt("All Masters")
    .up()
    .up()
    .ele("REQUESTDATA");

  for (const item of ledgers) {
    const message = requestData.ele("TALLYMESSAGE", { "xmlns:UDF": "TallyUDF" });
    const ledger = message.ele("LEDGER", { NAME: cleanTallyText(item.name), ACTION: "Create" });
    ledger.ele("NAME").txt(cleanTallyText(item.name)).up();
    ledger.ele("PARENT").txt(cleanTallyText(item.parent)).up();
    ledger.ele("ISBILLWISEON").txt("Yes").up();
    ledger.ele("ISCOSTCENTRESON").txt("No").up();
    ledger.ele("AFFECTSSTOCK").txt("No").up();
    if (item.gstNumber) ledger.ele("PARTYGSTIN").txt(cleanTallyText(item.gstNumber)).up();
    if (item.address) addAddress(ledger, "ADDRESS.LIST", item.address);
    ledger.up();
    message.up();
  }

  return requestData.doc().end({ prettyPrint: true });
}

export type TallyRequestName =
  | "client ledger fetch"
  | "stock item fetch"
  | "sales voucher/rate fetch"
  | "sales item rate fetch";

export class TallyRequestError extends Error {
  responseBody: string;

  constructor(message: string, responseBody = "") {
    super(message);
    this.name = "TallyRequestError";
    this.responseBody = responseBody;
  }
}

export function tallyExportXml(requestName: TallyRequestName, fromDate?: string, toDate?: string) {
  const reportName = reportNameForRequest(requestName);
  if (requestName === "sales item rate fetch" || requestName === "sales voucher/rate fetch") {
    console.log("Sales rate report called: JP_SALES_EXPORT_REPORT");
    return tallyReportExportXml(reportName, fromDate, toDate);
  }

  const envelope = create({ version: "1.0", encoding: "UTF-8" }).ele("ENVELOPE");

  const header = envelope.ele("HEADER");
  header.ele("VERSION").txt("1").up();
  header.ele("TALLYREQUEST").txt("Export").up();
  header.ele("TYPE").txt("Data").up();
  header.ele("ID").txt(reportName).up();

  const staticVariables = envelope.ele("BODY").ele("DESC").ele("STATICVARIABLES");

  if (process.env.TALLY_COMPANY_NAME) {
    staticVariables.ele("SVCURRENTCOMPANY").txt(process.env.TALLY_COMPANY_NAME).up();
  }
  staticVariables.ele("SVEXPORTFORMAT").txt("$$SysName:XML").up();
  if (fromDate) staticVariables.ele("SVFROMDATE").txt(tallyDate(fromDate)).up();
  if (toDate) staticVariables.ele("SVTODATE").txt(tallyDate(toDate)).up();

  return envelope.doc().end({ prettyPrint: true });
}

export function tallyDataExportXml(reportName: string, fromDate?: string, toDate?: string) {
  const envelope = create({ version: "1.0", encoding: "UTF-8" }).ele("ENVELOPE");

  const header = envelope.ele("HEADER");
  header.ele("VERSION").txt("1").up();
  header.ele("TALLYREQUEST").txt("Export").up();
  header.ele("TYPE").txt("Data").up();
  header.ele("ID").txt(reportName).up();

  const staticVariables = envelope.ele("BODY").ele("DESC").ele("STATICVARIABLES");
  if (process.env.TALLY_COMPANY_NAME) {
    staticVariables.ele("SVCURRENTCOMPANY").txt(process.env.TALLY_COMPANY_NAME).up();
  }
  staticVariables.ele("SVEXPORTFORMAT").txt("$$SysName:XML").up();
  if (fromDate) staticVariables.ele("SVFROMDATE", { TYPE: "Date" }).txt(tallyDisplayDate(fromDate)).up();
  if (toDate) staticVariables.ele("SVTODATE", { TYPE: "Date" }).txt(tallyDisplayDate(toDate)).up();

  return envelope.doc().end({ prettyPrint: true });
}

export function tallyInlineSalesItemCollectionXml(fromDate?: string, toDate?: string) {
  const collectionName = "JP Sales Item Export Inline";
  const envelope = create({ version: "1.0", encoding: "UTF-8" }).ele("ENVELOPE");

  const header = envelope.ele("HEADER");
  header.ele("VERSION").txt("1").up();
  header.ele("TALLYREQUEST").txt("Export").up();
  header.ele("TYPE").txt("Collection").up();
  header.ele("ID").txt(collectionName).up();

  const desc = envelope.ele("BODY").ele("DESC");
  const staticVariables = desc.ele("STATICVARIABLES");
  if (process.env.TALLY_COMPANY_NAME) {
    staticVariables.ele("SVCURRENTCOMPANY").txt(process.env.TALLY_COMPANY_NAME).up();
  }
  staticVariables.ele("SVEXPORTFORMAT").txt("$$SysName:XML").up();
  if (fromDate) staticVariables.ele("SVFROMDATE", { TYPE: "Date" }).txt(tallyDisplayDate(fromDate)).up();
  if (toDate) staticVariables.ele("SVTODATE", { TYPE: "Date" }).txt(tallyDisplayDate(toDate)).up();
  if (fromDate) staticVariables.ele("SVCURRENTDATE", { TYPE: "Date" }).txt(tallyDisplayDate(fromDate)).up();

  const collection = desc
    .ele("TDL")
    .ele("TDLMESSAGE")
    .ele("COLLECTION", { NAME: collectionName, ISINITIALIZE: "Yes" });
  collection.ele("TYPE").txt("Voucher").up();
  collection.ele("FILTERS").txt("JPInlineSalesOnly, JPInlineDateRange").up();
  collection
    .ele("FETCH")
    .txt(
      [
        "Date",
        "VoucherNumber",
        "VoucherTypeName",
        "PartyLedgerName",
        "PartyName",
        "AllInventoryEntries.*",
        "InventoryEntries.*",
      ].join(","),
    )
    .up();
  collection
    .up()
    .ele("SYSTEM", { TYPE: "Formulae", NAME: "JPInlineSalesOnly" })
    .txt("$$IsSales:$VoucherTypeName")
    .up()
    .ele("SYSTEM", { TYPE: "Formulae", NAME: "JPInlineDateRange" })
    .txt("$Date >= ##SVFromDate AND $Date <= ##SVToDate")
    .up();

  return envelope.doc().end({ prettyPrint: true });
}

function tallyReportExportXml(reportName: string, fromDate?: string, toDate?: string) {
  const requestDesc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("ENVELOPE")
    .ele("HEADER")
    .ele("TALLYREQUEST")
    .txt("Export")
    .up()
    .up()
    .ele("BODY")
    .ele("EXPORTDATA")
    .ele("REQUESTDESC");

  requestDesc.ele("REPORTNAME").txt(reportName).up();
  const staticVariables = requestDesc.ele("STATICVARIABLES");
  staticVariables.ele("SVEXPORTFORMAT").txt("$$SysName:XML").up();
  if (process.env.TALLY_COMPANY_NAME) {
    staticVariables.ele("SVCURRENTCOMPANY").txt(process.env.TALLY_COMPANY_NAME).up();
  }
  if (fromDate) staticVariables.ele("SVFROMDATE", { TYPE: "Date" }).txt(tallyDisplayDate(fromDate)).up();
  if (toDate) staticVariables.ele("SVTODATE", { TYPE: "Date" }).txt(tallyDisplayDate(toDate)).up();

  return requestDesc.doc().end({ prettyPrint: true });
}

export async function postToTally(xml: string, requestName = "Tally request") {
  const tallyUrl = process.env.TALLY_HTTP_URL;
  if (!tallyUrl) throw new Error("TALLY_HTTP_URL is not configured.");
  console.log(`[Tally] ${requestName} request XML:\n${xml}`);
  const timeoutMs = Number(process.env.TALLY_HTTP_TIMEOUT_MS || 180000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(tallyUrl, {
      method: "POST",
      headers: { "content-type": "text/xml" },
      body: xml,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TallyRequestError(`${requestName}: Tally did not respond within ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.text();
  console.log(`[Tally] ${requestName} raw response:\n${body}`);
  if (!response.ok) throw new TallyRequestError(`Tally HTTP ${response.status}: ${body}`, body);
  if (isTallyRootResponse(body)) {
    throw new TallyRequestError(
      `${requestName}: Tally server is reachable, but no report was returned. The request envelope was not accepted as a data export.`,
      body,
    );
  }
  if (isTallyUnknownRequest(body)) {
    throw new TallyRequestError(`${requestName}: Tally returned Unknown Request for this export envelope.`, body);
  }
  return body;
}

export function parseTallyXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "value",
    trimValues: true,
    processEntities: false,
  });
  return parser.parse(xml);
}

export function collectNodes(root: unknown, nodeName: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  walk(root, nodeName.toUpperCase(), found);
  return found;
}

export function listNodeNames(root: unknown) {
  const names = new Set<string>();
  collectNodeNames(root, names);
  return [...names].sort();
}

function walk(value: unknown, nodeName: string, found: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, nodeName, found));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.toUpperCase() === nodeName) {
      if (Array.isArray(child)) found.push(...(child.filter(Boolean) as Record<string, unknown>[]));
      else if (child && typeof child === "object") found.push(child as Record<string, unknown>);
    }
    walk(child, nodeName, found);
  }
}

function collectNodeNames(value: unknown, names: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNodeNames(item, names));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    names.add(key);
    collectNodeNames(child, names);
  }
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function nodeText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return decodeBasicXmlEntities(String(value));
  if (typeof value === "object" && "value" in value) return decodeBasicXmlEntities(String((value as { value?: unknown }).value ?? ""));
  return "";
}

function decodeBasicXmlEntities(value: string) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function tallyDate(date: string) {
  return date.replaceAll("-", "");
}

function tallyDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getDate()}-${parsed.toLocaleString("en-US", { month: "short" })}-${parsed.getFullYear()}`;
}

function isTallyRootResponse(body: string) {
  return body.replace(/\s+/g, "").toUpperCase() === "<RESPONSE>TALLYPRIMESERVERISRUNNING</RESPONSE>";
}

function isTallyUnknownRequest(body: string) {
  return body.toUpperCase().includes("<RESPONSE>UNKNOWN REQUEST, CANNOT BE PROCESSED</RESPONSE>");
}

function reportNameForRequest(requestName: TallyRequestName) {
  if (requestName === "client ledger fetch") {
    return "List of Accounts";
  }

  if (requestName === "stock item fetch") {
    return "Stock Summary";
  }

  if (requestName === "sales item rate fetch") {
    return "JP_SALES_EXPORT_REPORT";
  }

  return "JP_SALES_EXPORT_REPORT";
}

function ledger(parent: XmlNode, name: string, amount: number, isParty: boolean, envelopeMode: "requestdata" | "sample-data" = "requestdata") {
  const entry = parent.ele(envelopeMode === "sample-data" ? "LEDGERENTRIES.LIST" : "ALLLEDGERENTRIES.LIST");
  entry.ele("LEDGERNAME").txt(cleanTallyText(name)).up();
  entry.ele("ISDEEMEDPOSITIVE").txt(amount < 0 ? "Yes" : "No").up();
  entry.ele("ISPARTYLEDGER").txt(isParty ? "Yes" : "No").up();
  entry.ele("ISLASTDEEMEDPOSITIVE").txt(amount < 0 ? "Yes" : "No").up();
  entry.ele("AMOUNT").txt(round2(amount).toFixed(2)).up();
  entry.up();
}

function partyLedger(parent: XmlNode, name: string, amount: number, envelopeMode: "requestdata" | "sample-data" = "requestdata") {
  const entry = parent.ele(envelopeMode === "sample-data" ? "LEDGERENTRIES.LIST" : "ALLLEDGERENTRIES.LIST");
  entry.ele("LEDGERNAME").txt(cleanTallyText(name)).up();
  entry.ele("ISDEEMEDPOSITIVE").txt("Yes").up();
  entry.ele("ISPARTYLEDGER").txt("Yes").up();
  entry.ele("ISLASTDEEMEDPOSITIVE").txt("Yes").up();
  entry.ele("AMOUNT").txt((-round2(amount)).toFixed(2)).up();
  const bill = entry.ele("BILLALLOCATIONS.LIST");
  bill.ele("NAME").txt(cleanTallyText(name)).up();
  bill.ele("BILLTYPE").txt("New Ref").up();
  bill.ele("AMOUNT").txt((-round2(amount)).toFixed(2)).up();
  bill.up();
  entry.up();
}

function inventoryEntry(
  parent: XmlNode,
  item: LineItem,
  salesLedgerName: string,
  options: {
    godownName?: string;
    qtySign?: "positive" | "negative";
    includeBatchAllocation?: boolean;
  } = {},
) {
  const qty = Math.abs(Number(item.qty || 0));
  const meta = readTallyItemMeta(item.specification);
  const billedUnit = cleanTallyUnit(meta?.per || item.unit || "Nos");
  const primaryUnit = cleanTallyUnit(item.unit || "Nos");
  const rate = Math.abs(Number(meta?.rate ?? item.rate ?? 0));
  const amount = round2(Number(item.amount || qty * rate));
  const stockName = cleanTallyText(item.description);
  const qtySign = options.qtySign || "negative";
  const primaryQty = `${qtySign === "negative" ? "-" : ""}${formatQty(qty)} ${primaryUnit}`;
  const billedQtyValue = meta ? round2(qty * Number(meta.factor || 1)) : qty;
  const billedQty = `${qtySign === "negative" ? "-" : ""}${formatQty(billedQtyValue)} ${billedUnit}`;
  const entry = parent.ele("ALLINVENTORYENTRIES.LIST");

  entry.ele("STOCKITEMNAME").txt(stockName).up();
  entry.ele("ISDEEMEDPOSITIVE").txt("No").up();
  entry.ele("ISLASTDEEMEDPOSITIVE").txt("No").up();
  entry.ele("RATE").txt(`${rate.toFixed(2)}/${billedUnit}`).up();
  entry.ele("AMOUNT").txt(amount.toFixed(2)).up();
  entry.ele("ACTUALQTY").txt(primaryQty).up();
  entry.ele("BILLEDQTY").txt(billedQty).up();
  const specification = stripTallyItemMeta(item.specification);
  if (specification) entry.ele("BASICUSERDESCRIPTION.LIST").ele("BASICUSERDESCRIPTION").txt(cleanTallyText(specification)).up().up();

  const accounting = entry.ele("ACCOUNTINGALLOCATIONS.LIST");
  accounting.ele("LEDGERNAME").txt(salesLedgerName).up();
  accounting.ele("ISDEEMEDPOSITIVE").txt("No").up();
  accounting.ele("AMOUNT").txt(amount.toFixed(2)).up();
  accounting.up();

  if (options.includeBatchAllocation) {
    const batch = entry.ele("BATCHALLOCATIONS.LIST");
    batch.ele("GODOWNNAME").txt(cleanTallyText(options.godownName || "Main Location")).up();
    batch.ele("BATCHNAME").txt("Primary Batch").up();
    batch.ele("DESTINATIONGODOWNNAME").txt(cleanTallyText(options.godownName || "Main Location")).up();
    batch.ele("AMOUNT").txt(amount.toFixed(2)).up();
    batch.ele("ACTUALQTY").txt(primaryQty).up();
    batch.ele("BILLEDQTY").txt(billedQty).up();
    batch.up();
  }

  entry.up();
}

function addAddress(parent: XmlNode, listName: string, address: string) {
  const lines = cleanTallyText(address)
    .split(/\r?\n|,\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
  const list = parent.ele(listName, { TYPE: "String" });
  for (const line of lines.length ? lines : [""]) {
    list.ele("ADDRESS").txt(line).up();
  }
  list.up();
}

function cleanTallyText(value: string) {
  return String(value ?? "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanTallyUnit(value: string) {
  const unit = cleanTallyText(value)
    .replace(/\s*=\s*/g, "=")
    .split("=")[0]
    .trim();

  const normalized = unit.toLowerCase();
  if (normalized === "no" || normalized === "piece") return "nos";
  if (normalized === "sq ft" || normalized === "sft") return "sqft";
  if (normalized === "sheets") return "sheet";
  return unit || "Nos";
}

function stateNameFromGstin(gstin: string) {
  const code = cleanTallyText(gstin).slice(0, 2);
  const states: Record<string, string> = {
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "36": "Telangana",
    "37": "Andhra Pradesh",
  };
  return states[code] || "Maharashtra";
}

function round2(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatQty(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, useGrouping: false });
}
