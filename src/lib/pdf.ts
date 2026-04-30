import PDFDocument from "pdfkit/js/pdfkit.standalone";
import { brand } from "./brand";
import { stripTallyItemMeta } from "./tally-item-meta";
import type { LineItem, Quotation } from "./types";

const margin = 42;
const pageWidth = 595.28;
const pageHeight = 841.89;
const contentWidth = pageWidth - margin * 2;
const bottomMargin = 86;

const green = "#1f6f50";
const deepGreen = "#124632";
const text = "#1d2520";
const muted = "#5d6b60";
const line = "#d8dfd7";
const softLine = "#e8ede7";
const band = "#eef3ee";

const tableColumns = [
  { key: "sr", label: "#", x: margin, width: 26, align: "center" as const },
  { key: "description", label: "Description", x: margin + 26, width: 143, align: "left" as const },
  { key: "specification", label: "Specification", x: margin + 169, width: 107, align: "left" as const },
  { key: "qty", label: "Qty", x: margin + 276, width: 44, align: "right" as const },
  { key: "unit", label: "Unit", x: margin + 320, width: 38, align: "center" as const },
  { key: "rate", label: "Rate", x: margin + 358, width: 68, align: "right" as const },
  { key: "amount", label: "Amount", x: margin + 426, width: 85.28, align: "right" as const },
];

export async function quotationPdfBuffer(quotation: Quotation) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    margin,
    size: "A4",
  });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  addPage(doc, true);
  drawIntro(doc, quotation);
  drawItemsTable(doc, quotation.quotation_items ?? []);
  drawTotalsAndClosing(doc, quotation);
  drawPageNumbers(doc);

  doc.end();
  return done;
}

function addPage(doc: PDFKit.PDFDocument, firstPage = false) {
  doc.addPage({ margin, size: "A4" });
  drawHeader(doc, firstPage);
  doc.y = firstPage ? 96 : 74;
}

function drawHeader(doc: PDFKit.PDFDocument, firstPage: boolean) {
  doc.rect(0, 0, pageWidth, firstPage ? 84 : 58).fill(firstPage ? green : "white");

  if (firstPage) {
    doc.circle(margin + 14, 29, 16).fill("white");
    doc.fillColor(green).font("Helvetica-Bold").fontSize(11.5).text("JP", margin + 5, 22, { width: 18, align: "center" });
    doc.fillColor("white").font("Helvetica-Bold").fontSize(24).text(brand.businessName, margin + 38, 18);
    doc.font("Helvetica").fontSize(7.2).text(`Contact Person: ${brand.contactPerson}`, margin + 38, 40);
    doc.text(`${brand.phone} | ${brand.email}`, margin + 38, 51);

    doc.roundedRect(pageWidth - margin - 120, 18, 120, 42, 4).strokeColor("#ffffff").stroke();
    doc.fillColor("white").font("Helvetica-Bold").fontSize(14).text("QUOTATION", pageWidth - margin - 112, 28, {
      width: 104,
      align: "center",
    });
    return;
  }

  doc.fillColor(green).font("Helvetica-Bold").fontSize(15).text(brand.businessName, margin, 18);
  doc.fillColor(muted).font("Helvetica").fontSize(7.2).text(`${brand.phone} | ${brand.email}`, margin, 37);
  doc.moveTo(margin, 58).lineTo(pageWidth - margin, 58).strokeColor(line).stroke();
}

function drawIntro(doc: PDFKit.PDFDocument, quotation: Quotation) {
  const top = doc.y;
  const leftWidth = 316;
  const rightX = margin + leftWidth + 16;
  const rightWidth = contentWidth - leftWidth - 16;

  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text("Prepared For", margin, top + 8);
  simpleCard(doc, margin, top + 26, leftWidth, 102);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(10).text(cleanPdfText(quotation.client_name), margin + 12, top + 38, {
    width: leftWidth - 24,
  });
  doc.fillColor(muted).font("Helvetica").fontSize(7.2).text(cleanPdfText(quotation.address), margin + 12, top + 56, {
    width: leftWidth - 24,
    height: 30,
  });
  doc.text(`Contact: ${extractContact(quotation.address)}`, margin + 12, top + 87, { width: leftWidth - 24 });
  doc.text(`Email: ${extractEmail(quotation.address)}`, margin + 12, top + 99, { width: leftWidth - 24 });
  doc.text(`GSTIN: ${quotation.gst_number || "-"}`, margin + 12, top + 111, { width: leftWidth - 24 });
  doc.text(`Project: ${cleanPdfText(quotation.project_name) || "-"}`, margin + 12, top + 123, { width: leftWidth - 24 });

  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text("Quotation Details", rightX, top + 8);
  simpleCard(doc, rightX, top + 26, rightWidth, 102);
  infoLine(doc, "Quotation No.", quotation.quotation_no, rightX + 12, top + 42, rightWidth - 24);
  infoLine(doc, "Date", formatDate(quotation.quote_date), rightX + 12, top + 63, rightWidth - 24);
  infoLine(doc, "GSTIN", brand.gstin, rightX + 12, top + 84, rightWidth - 24);
  infoLine(doc, "Status", quotation.status === "approved" ? "Approved" : "Draft", rightX + 12, top + 105, rightWidth - 24);

  const fromY = top + 150;
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("From", margin, fromY);
  doc.fillColor(muted).font("Helvetica").fontSize(7).text(brand.address, margin + 30, fromY, {
    width: contentWidth - 30,
  });

  const shipY = fromY + 22;
  simpleCard(doc, margin, shipY, contentWidth, 50);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("Ship To", margin + 12, shipY + 13);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(7.8).text(
    cleanPdfText(quotation.ship_to_enabled ? quotation.ship_to_name || quotation.client_name : quotation.project_name),
    margin + 66,
    shipY + 12,
    { width: 240 },
  );
  doc.fillColor(muted).font("Helvetica").fontSize(6.9).text(
    cleanPdfText(quotation.ship_to_enabled ? quotation.ship_to_address || quotation.address : quotation.project_name),
    margin + 66,
    shipY + 24,
    { width: 280, height: 18 },
  );
  doc.text(
    `GSTIN: ${quotation.ship_to_enabled ? quotation.ship_to_gst_number || quotation.gst_number || "-" : quotation.gst_number || "-"}`,
    pageWidth - margin - 118,
    shipY + 13,
    { width: 106, align: "right" },
  );

  const noteY = shipY + 64;
  simpleCard(doc, margin, noteY, contentWidth, 36);
  doc.fillColor(green).font("Helvetica-Bold").fontSize(8.6).text("Commercial Note", margin + 12, noteY + 10);
  doc.fillColor(text).font("Helvetica").fontSize(7).text(
    "Please find our carefully prepared offer for your kind approval. The rates are proposed with current market conditions, reliable material availability, and Jaydeep Ply's commitment to timely support.",
    margin + 110,
    noteY + 10,
    { width: contentWidth - 122, height: 16 },
  );

  doc.y = noteY + 52;
}

function drawItemsTable(doc: PDFKit.PDFDocument, items: LineItem[]) {
  ensureSpace(doc, 36);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text("Material Details", margin, doc.y);
  doc.fillColor(muted).font("Helvetica").fontSize(7.6).text("Rates are in INR and taxes are shown separately in the summary below.", margin + 118, doc.y + 2);
  doc.y += 18;
  drawTableHeader(doc);

  if (!items.length) {
    const y = doc.y;
    doc.rect(margin, y, contentWidth, 34).strokeColor(line).stroke();
    doc.fillColor(muted).font("Helvetica").fontSize(8).text("No items added.", margin + 10, y + 12);
    doc.y = y + 34;
    return;
  }

  items.forEach((item, index) => {
    const rowHeight = getRowHeight(doc, item);
    ensureSpace(doc, rowHeight + 2, true);
    drawRow(doc, item, index + 1, rowHeight);
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument) {
  ensureSpace(doc, 26);
  const y = doc.y;
  doc.rect(margin, y, contentWidth, 24).fill(band);
  doc.rect(margin, y, contentWidth, 24).strokeColor(line).stroke();
  doc.fillColor(text).font("Helvetica-Bold").fontSize(7.8);
  tableColumns.forEach((column) => {
    doc.text(column.label, column.x + 4, y + 8, {
      width: column.width - 8,
      align: column.align,
      lineBreak: false,
    });
    if (column.x > margin) doc.moveTo(column.x, y).lineTo(column.x, y + 24).strokeColor(line).stroke();
  });
  doc.y = y + 24;
}

function drawRow(doc: PDFKit.PDFDocument, item: LineItem, serialNo: number, height: number) {
  const y = doc.y;
  const description = cleanPdfText(item.description);
  const specification = cleanSpecText(item.specification);
  const unit = formatUnit(item.unit);

  doc.rect(margin, y, contentWidth, height).fillAndStroke(serialNo % 2 === 0 ? "#fbfcfa" : "white", softLine);
  tableColumns.slice(1).forEach((column) => {
    doc.moveTo(column.x, y).lineTo(column.x, y + height).strokeColor(softLine).stroke();
  });

  doc.fillColor(text).font("Helvetica").fontSize(7.4);
  cell(doc, String(serialNo), tableColumns[0], y, height);
  cell(doc, description, tableColumns[1], y, height);
  cell(doc, specification, tableColumns[2], y, height);
  cell(doc, formatQty(item.qty), tableColumns[3], y, height);
  cell(doc, unit, tableColumns[4], y, height);
  cell(doc, pdfMoney(item.rate), tableColumns[5], y, height);
  cell(doc, pdfMoney(item.amount), tableColumns[6], y, height);

  doc.y = y + height;
}

function cell(
  doc: PDFKit.PDFDocument,
  value: string,
  column: (typeof tableColumns)[number],
  y: number,
  height: number,
) {
  doc.text(cleanPdfText(value), column.x + 4, y + 7, {
    width: column.width - 8,
    height: height - 10,
    align: column.align,
    ellipsis: false,
  });
}

function getRowHeight(doc: PDFKit.PDFDocument, item: LineItem) {
  doc.font("Helvetica").fontSize(7.4);
  const descHeight = doc.heightOfString(cleanPdfText(item.description), { width: tableColumns[1].width - 8 });
  const specHeight = doc.heightOfString(cleanSpecText(item.specification), { width: tableColumns[2].width - 8 });
  return Math.max(30, Math.ceil(Math.max(descHeight, specHeight) + 16));
}

function drawTotalsAndClosing(doc: PDFKit.PDFDocument, quotation: Quotation) {
  ensureSpace(doc, 182);
  doc.y += 14;
  const y = doc.y;
  const termsWidth = 292;
  const totalsX = margin + termsWidth + 20;
  const totalsWidth = contentWidth - termsWidth - 20;

  simpleCard(doc, margin, y, termsWidth, 94);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("Terms & Conditions", margin + 12, y + 12);
  doc.fillColor(text).font("Helvetica").fontSize(7.1).text(buildTermsText(quotation.terms), margin + 12, y + 28, {
    width: termsWidth - 24,
    height: 58,
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

  doc.roundedRect(totalsX, rowY, totalsWidth, 30, 4).fill(green);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(10).text("Grand Total", totalsX + 10, rowY + 10);
  doc.text(pdfMoney(quotation.grand_total), totalsX + 92, rowY + 10, { width: totalsWidth - 104, align: "right" });

  doc.y = Math.max(y + 104, rowY + 46);
  ensureSpace(doc, 44);
  const wordsY = doc.y;
  simpleCard(doc, margin, wordsY, contentWidth, 40);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8.5).text("Amount in Words", margin + 12, wordsY + 10);
  doc.fillColor(text)
    .font("Helvetica")
    .fontSize(7.6)
    .text(cleanPdfText(quotation.amount_in_words).replace(/^Rupees/i, "INR"), margin + 12, wordsY + 24, {
      width: contentWidth - 24,
    });

  doc.y = wordsY + 54;
  ensureSpace(doc, 70);
  const closeY = doc.y;
  simpleCard(doc, margin, closeY, contentWidth, 60);
  doc.fillColor(deepGreen).font("Helvetica-Bold").fontSize(9).text("Why Jaydeep Ply", margin + 12, closeY + 12);
  doc.fillColor(text)
    .font("Helvetica")
    .fontSize(7.1)
    .text(
      "We request your confirmation so we can block the required material and maintain smooth delivery planning. Our team will be glad to assist with any clarification, revision, or site-specific requirement.",
      margin + 12,
      closeY + 28,
      { width: 310 },
    );
  doc.fillColor(text).font("Helvetica").fontSize(8).text("For Jaydeep Ply", pageWidth - margin - 150, closeY + 18, {
    width: 142,
    align: "center",
  });
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8.6).text(brand.contactPerson, pageWidth - margin - 150, closeY + 34, {
    width: 142,
    align: "center",
  });
  doc.y = closeY + 72;
}

function totalRow(doc: PDFKit.PDFDocument, label: string, amount: number, x: number, y: number, width: number) {
  doc.rect(x, y, width, 22).fillAndStroke("white", "#edf0ed");
  doc.fillColor(text).font("Helvetica").fontSize(8).text(label, x + 10, y + 7, { width: width / 2 });
  doc.font("Helvetica-Bold").text(pdfMoney(amount), x + width / 2, y + 7, { width: width / 2 - 10, align: "right" });
}

function ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number, withTableHeader = false) {
  if (doc.y + requiredHeight <= pageHeight - bottomMargin) return;
  addPage(doc);
  if (withTableHeader) drawTableHeader(doc);
}

function drawPageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.moveTo(margin, pageHeight - 68).lineTo(pageWidth - margin, pageHeight - 68).strokeColor(line).stroke();
    doc.fillColor(muted)
      .font("Helvetica")
      .fontSize(6.5)
      .text("Thank you for choosing Jaydeep Ply. Quality materials, clear pricing, and dependable service.", margin, pageHeight - 58, {
        width: contentWidth - 90,
        align: "left",
        lineBreak: false,
      });
    doc.fillColor(muted)
      .font("Helvetica")
      .fontSize(7)
      .text(`Page ${i + 1} of ${range.count}`, pageWidth - margin - 80, pageHeight - 58, {
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
  doc.fillColor(muted).font("Helvetica").fontSize(7.1).text(label, x, y, { width: 74, lineBreak: false });
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
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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

