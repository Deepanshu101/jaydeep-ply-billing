import PDFDocument from "pdfkit/js/pdfkit.standalone";
import { brand } from "./brand";
import { stripTallyItemMeta } from "./tally-item-meta";
import type { Invoice, LineItem } from "./types";

const margin = 42;
const pageWidth = 595.28;
const pageHeight = 841.89;
const contentWidth = pageWidth - margin * 2;
const bottomMargin = 64;

const green = "#1f6f50";
const text = "#1d2520";
const muted = "#5d6b60";
const line = "#d8dfd7";
const band = "#eef3ee";

const columns = [
  { label: "#", width: 28, align: "center" as const },
  { label: "Description", width: 150, align: "left" as const },
  { label: "Specification", width: 112, align: "left" as const },
  { label: "Qty", width: 44, align: "right" as const },
  { label: "Unit", width: 42, align: "center" as const },
  { label: "Rate", width: 64, align: "right" as const },
  { label: "Amount", width: 71.28, align: "right" as const },
];

export async function invoicePdfBuffer(invoice: Invoice) {
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, margin, size: "A4" });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  addPage(doc, true);
  drawHeader(doc, true);
  drawIntro(doc, invoice);
  drawItems(doc, invoice.invoice_items ?? []);
  drawSummary(doc, invoice);
  drawPageFooter(doc);

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
    doc.roundedRect(pageWidth - margin - 104, 18, 104, 42, 4).strokeColor("#ffffff").stroke();
    doc.fillColor("white").font("Helvetica-Bold").fontSize(14).text("INVOICE", pageWidth - margin - 96, 28, {
      width: 88,
      align: "center",
    });
    return;
  }

  doc.fillColor(green).font("Helvetica-Bold").fontSize(15).text(brand.businessName, margin, 18);
  doc.fillColor(muted).font("Helvetica").fontSize(7.2).text(`${brand.phone} | ${brand.email}`, margin, 37);
  doc.moveTo(margin, 58).lineTo(pageWidth - margin, 58).strokeColor(line).stroke();
}

function drawIntro(doc: PDFKit.PDFDocument, invoice: Invoice) {
  const top = doc.y;
  const leftWidth = 316;
  const rightX = margin + leftWidth + 16;
  const rightWidth = contentWidth - leftWidth - 16;

  title(doc, "Prepared For", margin, top + 8);
  card(doc, margin, top + 26, leftWidth, 92);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(10).text(clean(invoice.client_name), margin + 12, top + 38, {
    width: leftWidth - 24,
  });
  doc.fillColor(muted).font("Helvetica").fontSize(7.2).text(clean(invoice.address), margin + 12, top + 56, {
    width: leftWidth - 24,
    height: 34,
  });
  doc.text(`GSTIN: ${invoice.gst_number || "-"}`, margin + 12, top + 98, { width: leftWidth - 24 });

  title(doc, "Invoice Details", rightX, top + 8);
  card(doc, rightX, top + 26, rightWidth, 92);
  infoLine(doc, "Invoice No.", invoice.invoice_no, rightX + 12, top + 42, rightWidth - 24);
  infoLine(doc, "Date", formatDate(invoice.invoice_date), rightX + 12, top + 61, rightWidth - 24);
  infoLine(doc, "Due Date", invoice.due_date ? formatDate(invoice.due_date) : "-", rightX + 12, top + 80, rightWidth - 24);
  infoLine(doc, "Status", invoice.tally_sync_status || "not_synced", rightX + 12, top + 99, rightWidth - 24);

  const noteY = top + 134;
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("Billing Note", margin, noteY);
  doc.fillColor(muted).font("Helvetica").fontSize(7).text(
    invoice.project_name ? `Project / Reference: ${clean(invoice.project_name)}` : "Invoice raised for material supply as per order confirmation.",
    margin + 58,
    noteY,
    { width: contentWidth - 58 },
  );

  doc.y = noteY + 24;
}

function drawItems(doc: PDFKit.PDFDocument, items: LineItem[]) {
  ensureSpace(doc, 34);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text("Inventory Details", margin, doc.y);
  doc.fillColor(muted).font("Helvetica").fontSize(7.4).text("Rates are shown in INR and taxes are calculated separately below.", margin + 112, doc.y + 2);
  doc.y += 18;
  drawTableHeader(doc);

  if (!items.length) {
    const y = doc.y;
    doc.rect(margin, y, contentWidth, 34).strokeColor(line).stroke();
    doc.fillColor(muted).font("Helvetica").fontSize(8).text("No invoice items found.", margin + 10, y + 12);
    doc.y = y + 34;
    return;
  }

  items.forEach((item, index) => {
    const rowHeight = rowHeightFor(doc, item);
    ensureSpace(doc, rowHeight + 2, true);
    const y = doc.y;
    doc.rect(margin, y, contentWidth, rowHeight).strokeColor("#edf0ed").stroke();
    let x = margin;
    const values = [
      String(index + 1),
      clean(item.description),
      clean(stripTallyItemMeta(item.specification)),
      formatQty(item.qty),
      clean(item.unit),
      money(item.rate),
      money(item.amount),
    ];
    values.forEach((value, valueIndex) => {
      doc.fillColor(text).font("Helvetica").fontSize(7.4).text(value, x + 4, y + 7, {
        width: columns[valueIndex].width - 8,
        height: rowHeight - 10,
        align: columns[valueIndex].align,
      });
      x += columns[valueIndex].width;
    });
    doc.y = y + rowHeight;
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument) {
  ensureSpace(doc, 26);
  const y = doc.y;
  doc.rect(margin, y, contentWidth, 24).fill(band);
  doc.rect(margin, y, contentWidth, 24).strokeColor(line).stroke();
  let x = margin;
  doc.fillColor(text).font("Helvetica-Bold").fontSize(7.8);
  columns.forEach((column) => {
    doc.text(column.label, x + 4, y + 8, { width: column.width - 8, align: column.align, lineBreak: false });
    if (x > margin) doc.moveTo(x, y).lineTo(x, y + 24).strokeColor(line).stroke();
    x += column.width;
  });
  doc.y = y + 24;
}

function drawSummary(doc: PDFKit.PDFDocument, invoice: Invoice) {
  ensureSpace(doc, 172);
  doc.y += 14;
  const y = doc.y;
  const leftWidth = 292;
  const rightX = margin + leftWidth + 20;
  const rightWidth = contentWidth - leftWidth - 20;

  card(doc, margin, y, leftWidth, 94);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("Terms and Narration", margin + 12, y + 12);
  doc.fillColor(text).font("Helvetica").fontSize(7.1).text(clean(invoice.terms || defaultNarration()), margin + 12, y + 28, {
    width: leftWidth - 24,
    height: 58,
  });

  let rowY = y;
  totalRow(doc, "Subtotal", invoice.subtotal, rightX, rowY, rightWidth);
  rowY += 22;
  if ((invoice.discount_amount ?? 0) > 0) {
    totalRow(doc, "Discount", -(invoice.discount_amount ?? 0), rightX, rowY, rightWidth);
    rowY += 22;
  }
  totalRow(doc, `CGST (${invoice.gst_percent / 2}%)`, invoice.cgst, rightX, rowY, rightWidth);
  rowY += 22;
  totalRow(doc, `SGST (${invoice.gst_percent / 2}%)`, invoice.sgst, rightX, rowY, rightWidth);
  rowY += 22;

  doc.roundedRect(rightX, rowY, rightWidth, 30, 4).fill(green);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(10).text("Grand Total", rightX + 10, rowY + 10);
  doc.text(money(invoice.grand_total), rightX + 92, rowY + 10, { width: rightWidth - 104, align: "right" });

  doc.y = Math.max(y + 104, rowY + 46);
  const wordsY = doc.y + 10;
  card(doc, margin, wordsY, contentWidth, 40);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8.5).text("Amount in Words", margin + 12, wordsY + 10);
  doc.fillColor(text).font("Helvetica").fontSize(7.6).text(clean(invoice.amount_in_words).replace(/^Rupees/i, "INR"), margin + 12, wordsY + 24, {
    width: contentWidth - 24,
  });

  doc.y = wordsY + 54;
  ensureSpace(doc, 72);
  const signY = doc.y;
  card(doc, margin, signY, contentWidth, 60);
  doc.fillColor(green).font("Helvetica-Bold").fontSize(9).text("For Jaydeep Ply", pageWidth - margin - 150, signY + 18, {
    width: 142,
    align: "center",
  });
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8.6).text(brand.contactPerson, pageWidth - margin - 150, signY + 34, {
    width: 142,
    align: "center",
  });
}

function drawPageFooter(doc: PDFKit.PDFDocument) {
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

function ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number, withHeader = false) {
  if (doc.y + requiredHeight <= pageHeight - bottomMargin) return;
  addPage(doc);
  if (withHeader) drawTableHeader(doc);
}

function rowHeightFor(doc: PDFKit.PDFDocument, item: LineItem) {
  doc.font("Helvetica").fontSize(7.4);
  const descriptionHeight = doc.heightOfString(clean(item.description), { width: columns[1].width - 8 });
  const specificationHeight = doc.heightOfString(clean(stripTallyItemMeta(item.specification)), { width: columns[2].width - 8 });
  return Math.max(28, Math.ceil(Math.max(descriptionHeight, specificationHeight) + 16));
}

function totalRow(doc: PDFKit.PDFDocument, label: string, amount: number, x: number, y: number, width: number) {
  doc.rect(x, y, width, 22).fillAndStroke("white", "#edf0ed");
  doc.fillColor(text).font("Helvetica").fontSize(8).text(label, x + 10, y + 7, { width: width / 2 });
  doc.font("Helvetica-Bold").text(money(amount), x + width / 2, y + 7, { width: width / 2 - 10, align: "right" });
}

function title(doc: PDFKit.PDFDocument, value: string, x: number, y: number) {
  doc.fillColor(text).font("Helvetica-Bold").fontSize(11).text(value, x, y);
}

function card(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) {
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

function money(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQty(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function clean(value: string) {
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

function defaultNarration() {
  return "Goods once sold will not be taken back without prior approval.\nTaxes are charged as applicable.\nDelivery, unloading, and installation, if any, will be billed separately.\nPayment as per agreed terms.";
}
