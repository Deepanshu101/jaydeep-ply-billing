import PDFDocument from "pdfkit/js/pdfkit.standalone";
import { brand } from "./brand";
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
const light = "#f6f8f4";
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
  doc.y = firstPage ? 118 : 96;
}

function drawHeader(doc: PDFKit.PDFDocument, firstPage: boolean) {
  doc.rect(0, 0, pageWidth, firstPage ? 92 : 72).fill(firstPage ? green : "white");

  if (firstPage) {
    doc.circle(margin + 16, 32, 16).fill("white");
    doc.fillColor(green).font("Helvetica-Bold").fontSize(12).text("JP", margin + 7, 25, { width: 18, align: "center" });
    doc.fillColor("white").font("Helvetica-Bold").fontSize(24).text(brand.businessName, margin + 42, 18);
    doc.font("Helvetica").fontSize(8.5).text(`Contact Person: ${brand.contactPerson}`, margin + 42, 47);
    doc.text(`${brand.phone} | ${brand.email}`, margin + 42, 61);

    doc.roundedRect(pageWidth - margin - 130, 20, 130, 46, 4).strokeColor("#ffffff").stroke();
    doc.fillColor("white").font("Helvetica-Bold").fontSize(16).text("QUOTATION", pageWidth - margin - 122, 31, {
      width: 114,
      align: "center",
    });
    return;
  }

  doc.fillColor(green).font("Helvetica-Bold").fontSize(13).text(brand.businessName, margin, 22);
  doc.fillColor(muted).font("Helvetica").fontSize(8).text(`${brand.phone} | ${brand.email}`, margin, 40);
  doc.moveTo(margin, 64).lineTo(pageWidth - margin, 64).strokeColor(line).stroke();
}

function drawIntro(doc: PDFKit.PDFDocument, quotation: Quotation) {
  const top = doc.y;
  const leftWidth = 310;
  const rightX = margin + leftWidth + 18;
  const rightWidth = contentWidth - leftWidth - 18;

  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text("Prepared For", margin, top);
  doc.roundedRect(margin, top + 18, leftWidth, 112, 4).fillAndStroke("white", line);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(10).text(cleanPdfText(quotation.client_name), margin + 12, top + 32, {
    width: leftWidth - 24,
  });
  doc.fillColor(muted).font("Helvetica").fontSize(8).text(cleanPdfText(quotation.address), margin + 12, top + 50, {
    width: leftWidth - 24,
    height: 38,
  });
  doc.fillColor(text).font("Helvetica").fontSize(8).text(`GSTIN: ${quotation.gst_number || "-"}`, margin + 12, top + 92);
  doc.text(`Project: ${cleanPdfText(quotation.project_name)}`, margin + 12, top + 106, { width: leftWidth - 24 });

  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text("Quotation Details", rightX, top);
  doc.roundedRect(rightX, top + 18, rightWidth, 112, 4).fillAndStroke(light, line);
  detailRow(doc, "Quotation No.", quotation.quotation_no, rightX + 12, top + 34, rightWidth - 24);
  detailRow(doc, "Date", formatDate(quotation.quote_date), rightX + 12, top + 54, rightWidth - 24);
  detailRow(doc, "GSTIN", brand.gstin, rightX + 12, top + 74, rightWidth - 24);
  detailRow(doc, "Status", titleCase(quotation.status), rightX + 12, top + 94, rightWidth - 24);

  const fromY = top + 150;
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("From", margin, fromY);
  doc.fillColor(muted).font("Helvetica").fontSize(8).text(`${brand.businessName}, ${brand.address}`, margin + 34, fromY, {
    width: contentWidth - 34,
  });

  let noteY = fromY + 32;
  if (quotation.ship_to_enabled) {
    doc.roundedRect(margin, noteY, contentWidth, 56, 4).fillAndStroke("white", line);
    doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("Ship To", margin + 12, noteY + 10);
    doc.fillColor(text)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(cleanPdfText(quotation.ship_to_name || quotation.client_name), margin + 72, noteY + 10, { width: 180 });
    doc.fillColor(muted)
      .font("Helvetica")
      .fontSize(8)
      .text(cleanPdfText(quotation.ship_to_address || quotation.address), margin + 72, noteY + 24, { width: 306, height: 24 });
    doc.fillColor(text)
      .font("Helvetica")
      .fontSize(8)
      .text(`GSTIN: ${quotation.ship_to_gst_number || quotation.gst_number || "-"}`, pageWidth - margin - 118, noteY + 10, {
        width: 106,
        align: "right",
      });
    noteY += 74;
  }

  doc.roundedRect(margin, noteY, contentWidth, 46, 4).fillAndStroke("#fbfcfa", line);
  doc.fillColor(deepGreen).font("Helvetica-Bold").fontSize(9).text("Commercial Note", margin + 12, noteY + 10);
  doc.fillColor(text)
    .font("Helvetica")
    .fontSize(8)
    .text(
      "Please find our carefully prepared offer for your kind approval. The rates are proposed with current market conditions, reliable material availability, and Jaydeep Ply's commitment to timely support.",
      margin + 12,
      noteY + 24,
      { width: contentWidth - 24 },
    );

  doc.y = noteY + 64;
}

function detailRow(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.fillColor(muted).font("Helvetica").fontSize(8).text(label, x, y, { width: 78 });
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8).text(value || "-", x + 82, y, { width: width - 82, align: "right" });
}

function drawItemsTable(doc: PDFKit.PDFDocument, items: LineItem[]) {
  ensureSpace(doc, 36);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text("Material Details", margin, doc.y);
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

  doc.rect(margin, y, contentWidth, height).fillAndStroke("white", "#edf0ed");
  tableColumns.slice(1).forEach((column) => {
    doc.moveTo(column.x, y).lineTo(column.x, y + height).strokeColor("#edf0ed").stroke();
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
  ensureSpace(doc, 220);
  doc.y += 16;
  const y = doc.y;
  const termsWidth = 286;
  const totalsX = margin + termsWidth + 20;
  const totalsWidth = contentWidth - termsWidth - 20;

  doc.roundedRect(margin, y, termsWidth, 102, 4).fillAndStroke("#fbfcfa", line);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("Terms & Conditions", margin + 12, y + 12);
  doc.fillColor(text).font("Helvetica").fontSize(7.8).text(cleanPdfText(quotation.terms), margin + 12, y + 28, {
    width: termsWidth - 24,
    height: 62,
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

  doc.y = Math.max(y + 122, rowY + 46);
  ensureSpace(doc, 44);
  const wordsY = doc.y;
  doc.roundedRect(margin, wordsY, contentWidth, 44, 4).fillAndStroke(light, line);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8.5).text("Amount in Words", margin + 12, wordsY + 10);
  doc.fillColor(text)
    .font("Helvetica")
    .fontSize(8)
    .text(cleanPdfText(quotation.amount_in_words).replace(/^Rupees/i, "INR"), margin + 12, wordsY + 24, {
      width: contentWidth - 24,
    });

  doc.y = wordsY + 62;
  ensureSpace(doc, 76);
  const closeY = doc.y;
  doc.roundedRect(margin, closeY, contentWidth, 66, 4).strokeColor(line).stroke();
  doc.fillColor(deepGreen).font("Helvetica-Bold").fontSize(9).text("Why Jaydeep Ply", margin + 12, closeY + 12);
  doc.fillColor(text)
    .font("Helvetica")
    .fontSize(8)
    .text(
      "We request your confirmation so we can block the required material and maintain smooth delivery planning. Our team will be glad to assist with any clarification, revision, or site-specific requirement.",
      margin + 12,
      closeY + 28,
      { width: 318 },
    );
  doc.fillColor(text).font("Helvetica").fontSize(8).text("For Jaydeep Ply", pageWidth - margin - 145, closeY + 20, {
    width: 145,
    align: "center",
  });
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text(brand.contactPerson, pageWidth - margin - 145, closeY + 42, {
    width: 145,
    align: "center",
  });
  doc.y = closeY + 76;
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
      .fontSize(7.2)
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

function titleCase(value: string) {
  return cleanPdfText(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function cleanSpecText(value: string) {
  return cleanPdfText(value)
    .replace(/\s*=\s*/g, " = ")
    .replace(/([a-z])Pricing:/i, "$1 | Pricing:")
    .replace(/([a-z])Conversion:/i, "$1 | Conversion:");
}

function cleanPdfText(value: string) {
  return String(value ?? "")
    .replace(/â‚¹/g, "Rs.")
    .replace(/\u00a0/g, " ")
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€˜â€™]/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}
