import PDFDocument from "pdfkit/js/pdfkit.standalone";
import { brand } from "./brand";
import { stripTallyItemMeta } from "./tally-item-meta";
import type { LineItem, Quotation } from "./types";

type Align = "left" | "center" | "right";
type PdfColumn = { key: string; label: string; x: number; width: number; align: Align };

const margin = 42;
const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

const firstHeaderSafe = 106;
const laterHeaderSafe = 78;
const footerSafe = 86;
const minTableFontSize = 8.5;

const green = "#1f6f50";
const deepGreen = "#124632";
const text = "#1d2520";
const muted = "#5d6b60";
const line = "#d8dfd7";
const softLine = "#e8ede7";
const band = "#eef3ee";

export async function quotationPdfBuffer(quotation: Quotation) {
  const landscape = shouldUseLandscape(quotation.quotation_items ?? []);
  const page = landscape ? A4_LANDSCAPE : A4_PORTRAIT;
  const contentWidth = page.width - margin * 2;

  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    margin,
    size: "A4",
    layout: landscape ? "landscape" : "portrait",
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const state = {
    pageWidth: page.width,
    pageHeight: page.height,
    contentWidth,
    landscape,
    columns: makeColumns(contentWidth),
    quotationNo: quotation.quotation_no,
    clientName: quotation.client_name,
  };

  addPage(doc, state, true);
  drawIntro(doc, quotation, state);
  drawItemsTable(doc, quotation.quotation_items ?? [], state);
  drawTotalsAndClosing(doc, quotation, state);
  drawPageNumbers(doc, state);

  doc.end();
  return done;
}

function shouldUseLandscape(items: LineItem[]) {
  return items.some((item) => {
    const description = cleanPdfText(item.description);
    const specification = cleanSpecText(item.specification);
    return description.length > 90 || specification.length > 120;
  }) || items.length > 18;
}

function makeColumns(contentWidth: number): PdfColumn[] {
  const fixed = 26 + 44 + 40 + 74 + 90;
  const remaining = contentWidth - fixed;
  const descriptionWidth = Math.max(150, remaining * 0.58);
  const specificationWidth = Math.max(110, remaining * 0.42);

  let x = margin;
  const columns: PdfColumn[] = [
    { key: "sr", label: "#", x, width: 26, align: "center" },
    { key: "description", label: "Description", x: 0, width: descriptionWidth, align: "left" },
    { key: "specification", label: "Specification", x: 0, width: specificationWidth, align: "left" },
    { key: "qty", label: "Qty", x: 0, width: 44, align: "right" },
    { key: "unit", label: "Unit", x: 0, width: 40, align: "center" },
    { key: "rate", label: "Rate", x: 0, width: 74, align: "right" },
    { key: "amount", label: "Amount", x: 0, width: 90, align: "right" },
  ];

  columns.forEach((column) => {
    column.x = x;
    x += column.width;
  });

  return columns;
}

function addPage(
  doc: PDFKit.PDFDocument,
  state: {
    pageWidth: number;
    pageHeight: number;
    contentWidth: number;
    quotationNo: string;
    clientName: string;
  },
  firstPage = false,
) {
  doc.addPage({ margin, size: "A4" });
  drawHeader(doc, state, firstPage);
  doc.y = firstPage ? firstHeaderSafe : laterHeaderSafe;
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  state: {
    pageWidth: number;
    contentWidth: number;
    quotationNo: string;
    clientName: string;
  },
  firstPage: boolean,
) {
  doc.rect(0, 0, state.pageWidth, firstPage ? 88 : 62).fill(firstPage ? green : "white");

  if (firstPage) {
    doc.circle(margin + 14, 29, 16).fill("white");
    doc.fillColor(green).font("Helvetica-Bold").fontSize(11.5).text("JP", margin + 5, 22, {
      width: 18,
      align: "center",
    });

    doc.fillColor("white").font("Helvetica-Bold").fontSize(24).text(brand.businessName, margin + 38, 18);
    doc.font("Helvetica").fontSize(7.2).text(`Contact Person: ${brand.contactPerson}`, margin + 38, 40);
    doc.text(`${brand.phone} | ${brand.email}`, margin + 38, 51);

    doc.roundedRect(state.pageWidth - margin - 132, 16, 132, 50, 4).strokeColor("#ffffff").stroke();
    doc.fillColor("white").font("Helvetica-Bold").fontSize(13).text("QUOTATION", state.pageWidth - margin - 124, 24, {
      width: 116,
      align: "center",
    });
    doc.font("Helvetica").fontSize(6.8).text(state.quotationNo || "-", state.pageWidth - margin - 124, 43, {
      width: 116,
      align: "center",
    });
    return;
  }

  doc.fillColor(green).font("Helvetica-Bold").fontSize(14).text(brand.businessName, margin, 17);
  doc.fillColor(muted).font("Helvetica").fontSize(7).text(`${brand.phone} | ${brand.email}`, margin, 35);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(7).text(`Quotation No.: ${state.quotationNo || "-"}`, state.pageWidth - margin - 170, 18, {
    width: 170,
    align: "right",
  });
  doc.fillColor(muted).font("Helvetica").fontSize(6.8).text(cleanPdfText(state.clientName), state.pageWidth - margin - 170, 35, {
    width: 170,
    align: "right",
  });

  doc.moveTo(margin, 62).lineTo(state.pageWidth - margin, 62).strokeColor(line).stroke();
}

function drawIntro(
  doc: PDFKit.PDFDocument,
  quotation: Quotation,
  state: { contentWidth: number; pageWidth: number },
) {
  const top = doc.y;
  const leftWidth = Math.min(330, state.contentWidth * 0.62);
  const rightX = margin + leftWidth + 16;
  const rightWidth = state.contentWidth - leftWidth - 16;

  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text("Prepared For", margin, top);
  simpleCard(doc, margin, top + 18, leftWidth, 108);

  doc.fillColor(text).font("Helvetica-Bold").fontSize(10).text(cleanPdfText(quotation.client_name), margin + 12, top + 30, {
    width: leftWidth - 24,
  });
  doc.fillColor(muted).font("Helvetica").fontSize(7.2).text(cleanPdfText(quotation.address), margin + 12, top + 48, {
    width: leftWidth - 24,
    height: 32,
  });
  doc.text(`Contact: ${extractContact(quotation.address)}`, margin + 12, top + 82, { width: leftWidth - 24 });
  doc.text(`Email: ${extractEmail(quotation.address)}`, margin + 12, top + 94, { width: leftWidth - 24 });
  doc.text(`GSTIN: ${quotation.gst_number || "-"}`, margin + 12, top + 106, { width: leftWidth - 24 });
  doc.text(`Project: ${cleanPdfText(quotation.project_name) || "-"}`, margin + 12, top + 118, { width: leftWidth - 24 });

  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text("Quotation Details", rightX, top);
  simpleCard(doc, rightX, top + 18, rightWidth, 108);
  infoLine(doc, "Quotation No.", quotation.quotation_no, rightX + 12, top + 35, rightWidth - 24);
  infoLine(doc, "Date", formatDate(quotation.quote_date), rightX + 56, top + 56, rightWidth - 24);
  infoLine(doc, "GSTIN", brand.gstin, rightX + 12, top + 77, rightWidth - 24);
  infoLine(doc, "Status", quotation.status === "approved" ? "Approved" : "Draft", rightX + 12, top + 98, rightWidth - 24);

  const fromY = top + 144;
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("From", margin, fromY);
  doc.fillColor(muted).font("Helvetica").fontSize(7).text(brand.address, margin + 34, fromY, {
    width: state.contentWidth - 34,
  });

  const shipY = fromY + 23;
  simpleCard(doc, margin, shipY, state.contentWidth, 50);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("Ship To", margin + 12, shipY + 13);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(7.8).text(
    cleanPdfText(quotation.ship_to_enabled ? quotation.ship_to_name || quotation.client_name : quotation.project_name),
    margin + 66,
    shipY + 12,
    { width: state.contentWidth - 210 },
  );
  doc.fillColor(muted).font("Helvetica").fontSize(6.9).text(
    cleanPdfText(quotation.ship_to_enabled ? quotation.ship_to_address || quotation.address : quotation.project_name),
    margin + 66,
    shipY + 24,
    { width: state.contentWidth - 210, height: 18 },
  );
  doc.text(
    `GSTIN: ${quotation.ship_to_enabled ? quotation.ship_to_gst_number || quotation.gst_number || "-" : quotation.gst_number || "-"}`,
    state.pageWidth - margin - 145,
    shipY + 13,
    { width: 133, align: "right" },
  );

  const noteY = shipY + 64;
  simpleCard(doc, margin, noteY, state.contentWidth, 36);
  doc.fillColor(green).font("Helvetica-Bold").fontSize(8.6).text("Commercial Note", margin + 12, noteY + 10);
  doc.fillColor(text).font("Helvetica").fontSize(7).text(
    "Please find our carefully prepared offer for your kind approval. Rates are proposed with current market conditions, reliable material availability, and Jaydeep Ply's commitment to timely support.",
    margin + 110,
    noteY + 10,
    { width: state.contentWidth - 122, height: 16 },
  );

  doc.y = noteY + 52;
}

function drawItemsTable(
  doc: PDFKit.PDFDocument,
  items: LineItem[],
  state: { columns: PdfColumn[]; contentWidth: number; pageHeight: number; pageWidth: number; quotationNo: string; clientName: string },
) {
  ensureSpace(doc, state, 38);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text("Material Details", margin, doc.y);
  doc.fillColor(muted).font("Helvetica").fontSize(7.6).text(
    "Rates are in INR and taxes are shown separately in the summary below.",
    margin + 118,
    doc.y + 2,
  );
  doc.y += 18;
  drawTableHeader(doc, state);

  if (!items.length) {
    const y = doc.y;
    doc.rect(margin, y, state.contentWidth, 34).strokeColor(line).stroke();
    doc.fillColor(muted).font("Helvetica").fontSize(8).text("No items added.", margin + 10, y + 12);
    doc.y = y + 34;
    return;
  }

  items.forEach((item, index) => {
    const rowHeight = getRowHeight(doc, item, state.columns);
    ensureSpace(doc, state, rowHeight + 2, true);
    drawRow(doc, item, index + 1, rowHeight, state);
  });
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  state: { columns: PdfColumn[]; contentWidth: number; pageHeight: number; pageWidth: number; quotationNo: string; clientName: string },
) {
  ensureSpace(doc, state, 26);
  const y = doc.y;
  doc.rect(margin, y, state.contentWidth, 24).fill(band);
  doc.rect(margin, y, state.contentWidth, 24).strokeColor(line).stroke();

  doc.fillColor(text).font("Helvetica-Bold").fontSize(minTableFontSize);
  state.columns.forEach((column) => {
    doc.text(column.label, column.x + 4, y + 7, {
      width: column.width - 8,
      align: column.align,
      lineBreak: false,
    });
    if (column.x > margin) {
      doc.moveTo(column.x, y).lineTo(column.x, y + 24).strokeColor(line).stroke();
    }
  });

  doc.y = y + 24;
}

function drawRow(
  doc: PDFKit.PDFDocument,
  item: LineItem,
  serialNo: number,
  height: number,
  state: { columns: PdfColumn[]; contentWidth: number },
) {
  const y = doc.y;
  const description = cleanPdfText(item.description);
  const specification = cleanSpecText(item.specification);
  const unit = formatUnit(item.unit);

  doc.rect(margin, y, state.contentWidth, height).fillAndStroke(serialNo % 2 === 0 ? "#fbfcfa" : "white", softLine);

  state.columns.slice(1).forEach((column) => {
    doc.moveTo(column.x, y).lineTo(column.x, y + height).strokeColor(softLine).stroke();
  });

  doc.fillColor(text).font("Helvetica").fontSize(minTableFontSize);
  cell(doc, String(serialNo), state.columns[0], y, height);
  cell(doc, description, state.columns[1], y, height);
  cell(doc, specification, state.columns[2], y, height);
  cell(doc, formatQty(item.qty), state.columns[3], y, height);
  cell(doc, unit, state.columns[4], y, height);
  cell(doc, pdfMoney(item.rate), state.columns[5], y, height);
  cell(doc, pdfMoney(item.amount), state.columns[6], y, height);

  doc.y = y + height;
}

function cell(doc: PDFKit.PDFDocument, value: string, column: PdfColumn, y: number, height: number) {
  doc.text(cleanPdfText(value), column.x + 4, y + 7, {
    width: column.width - 8,
    height: height - 10,
    align: column.align,
    ellipsis: false,
  });
}

function getRowHeight(doc: PDFKit.PDFDocument, item: LineItem, columns: PdfColumn[]) {
  doc.font("Helvetica").fontSize(minTableFontSize);
  const descHeight = doc.heightOfString(cleanPdfText(item.description), { width: columns[1].width - 8 });
  const specHeight = doc.heightOfString(cleanSpecText(item.specification), { width: columns[2].width - 8 });
  return Math.max(32, Math.ceil(Math.max(descHeight, specHeight) + 16));
}

function drawTotalsAndClosing(
  doc: PDFKit.PDFDocument,
  quotation: Quotation,
  state: { contentWidth: number; pageHeight: number; pageWidth: number; quotationNo: string; clientName: string },
) {
  ensureSpace(doc, state, 205);
  doc.y += 14;

  const y = doc.y;
  const termsWidth = Math.min(330, state.contentWidth * 0.58);
  const totalsX = margin + termsWidth + 20;
  const totalsWidth = state.contentWidth - termsWidth - 20;

  simpleCard(doc, margin, y, termsWidth, 100);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("Terms & Conditions", margin + 12, y + 12);
  doc.fillColor(text).font("Helvetica").fontSize(7.1).text(buildTermsText(quotation.terms), margin + 12, y + 28, {
    width: termsWidth - 24,
    height: 64,
  });

  let rowY = y;
  totalRow(doc, "Subtotal", quotation.subtotal, totalsX, rowY, totalsWidth);
  rowY += 22;

  if ((quotation.discount_amount ?? 0) > 0) {
    totalRow(doc, "Discount", -(quotation.discount_amount ?? 0), totalsX, rowY, totalsWidth);
    rowY += 22;
  }

  totalRow(doc, `CGST (${formatPercent(quotation.gst_percent / 2)})`, quotation.cgst, totalsX, rowY, totalsWidth);
  rowY += 22;
  totalRow(doc, `SGST (${formatPercent(quotation.gst_percent / 2)})`, quotation.sgst, totalsX, rowY, totalsWidth);
  rowY += 22;

  doc.roundedRect(totalsX, rowY, totalsWidth, 32, 4).fill(green);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(10).text("Grand Total", totalsX + 10, rowY + 11);
  doc.text(pdfMoney(quotation.grand_total), totalsX + 92, rowY + 11, {
    width: totalsWidth - 104,
    align: "right",
  });

  doc.y = Math.max(y + 112, rowY + 48);

  ensureSpace(doc, state, 48);
  const wordsY = doc.y;
  simpleCard(doc, margin, wordsY, state.contentWidth, 42);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8.5).text("Amount in Words", margin + 12, wordsY + 10);
  doc.fillColor(text).font("Helvetica").fontSize(7.6).text(
    cleanPdfText(quotation.amount_in_words).replace(/^Rupees/i, "INR"),
    margin + 12,
    wordsY + 24,
    { width: state.contentWidth - 24 },
  );

  doc.y = wordsY + 56;

  ensureSpace(doc, state, 76);
  const closeY = doc.y;
  simpleCard(doc, margin, closeY, state.contentWidth, 64);

  doc.fillColor(deepGreen).font("Helvetica-Bold").fontSize(9).text("Why Jaydeep Ply", margin + 12, closeY + 12);
  doc.fillColor(text).font("Helvetica").fontSize(7.1).text(
    "We request your confirmation so we can block the required material and maintain smooth delivery planning. Our team will be glad to assist with any clarification, revision, or site-specific requirement.",
    margin + 12,
    closeY + 28,
    { width: state.contentWidth - 200 },
  );

  doc.fillColor(text).font("Helvetica").fontSize(8).text("For Jaydeep Ply", state.pageWidth - margin - 150, closeY + 18, {
    width: 142,
    align: "center",
  });
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8.6).text("Authorized Signatory", state.pageWidth - margin - 150, closeY + 38, {
    width: 142,
    align: "center",
  });

  doc.y = closeY + 76;
}

function totalRow(doc: PDFKit.PDFDocument, label: string, amount: number, x: number, y: number, width: number) {
  doc.rect(x, y, width, 22).fillAndStroke("white", "#edf0ed");
  doc.fillColor(text).font("Helvetica").fontSize(8).text(label, x + 10, y + 7, { width: width / 2 });
  doc.font("Helvetica-Bold").text(pdfMoney(amount), x + width / 2, y + 7, {
    width: width / 2 - 10,
    align: "right",
  });
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  state: { pageHeight: number; pageWidth: number; contentWidth: number; quotationNo: string; clientName: string },
  requiredHeight: number,
  withTableHeader = false,
) {
  if (doc.y + requiredHeight <= state.pageHeight - footerSafe) return;
  addPage(doc, state);
  if (withTableHeader) drawTableHeader(doc, state as any);
}

function drawPageNumbers(
  doc: PDFKit.PDFDocument,
  state: { pageWidth: number; pageHeight: number; contentWidth: number; quotationNo: string },
) {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);

    doc.moveTo(margin, state.pageHeight - 68).lineTo(state.pageWidth - margin, state.pageHeight - 68).strokeColor(line).stroke();

    doc.fillColor(muted).font("Helvetica").fontSize(6.5).text(
      `Quotation No.: ${state.quotationNo || "-"} | Thank you for choosing Jaydeep Ply. Quality materials, clear pricing, and dependable service.`,
      margin,
      state.pageHeight - 58,
      {
        width: state.contentWidth - 90,
        align: "left",
        lineBreak: false,
      },
    );

    doc.fillColor(muted).font("Helvetica").fontSize(7).text(`Page ${i + 1} of ${range.count}`, state.pageWidth - margin - 80, state.pageHeight - 58, {
      width: 80,
      align: "right",
      lineBreak: false,
    });
  }
}

function simpleCard(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) {
  doc.roundedRect(x, y, width, height, 4).strokeColor(line).stroke();
}

function infoLine(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.fillColor(muted).font("Helvetica").fontSize(7.1).text(label, x, y, {
    width: 74,
    lineBreak: false,
  });
  doc.fillColor(text).font("Helvetica-Bold").fontSize(7.2).text(value || "-", x + 76, y, {
    width: width - 76,
    align: "right",
    lineBreak: false,
  });
}

function buildTermsText(value: string) {
  const base = cleanPdfText(value);
  const extras = [
    "Delivery schedule will be coordinated subject to order confirmation and material availability.",
    "Payment and unloading scope shall apply as mutually agreed before dispatch.",
    "Statutory tax revision, transport escalation, or special handling requirement will be charged extra where applicable.",
  ];
  const merged = [base, ...extras.filter((line) => !base.toLowerCase().includes(line.toLowerCase().slice(0, 20)))].filter(Boolean);
  return merged.join("\n");
}

function pdfMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatPercent(value: number) {
  return `${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
}

function formatUnit(value: string) {
  const unit = cleanPdfText(value)
    .replace(/\s*=\s*/g, " = ")
    .replace(/\s+/g, " ")
    .trim();

  if (!unit.includes("=")) return unit;

  const primaryUnit = unit.split("=")[0]?.trim();
  return primaryUnit || unit;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function cleanSpecText(value: string) {
  return cleanPdfText(stripTallyItemMeta(value))
    .replace(/\s*=\s*/g, " = ")
    .replace(/([a-z])Pricing:/i, "$1 | Pricing:")
    .replace(/([a-z])Conversion:/i, "$1 | Conversion:");
}

function cleanPdfText(value: string) {
  return String(value ?? "")
    .replace(/[\u20b9]/g, "Rs.")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractContact(value: string) {
  const match = cleanPdfText(value).match(/(\+?\d[\d\s-]{7,}\d)/);
  return match ? match[1] : "-";
}

function extractEmail(value: string) {
  const match = cleanPdfText(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "-";
}