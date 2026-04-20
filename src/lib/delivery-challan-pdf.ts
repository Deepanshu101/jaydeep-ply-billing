import PDFDocument from "pdfkit/js/pdfkit.standalone";
import { brand } from "./brand";
import type { DeliveryChallan, LineItem } from "./types";

export const deliveryChallanColumns = [
  { key: "description", label: "Description", align: "left" as const },
  { key: "specification", label: "Specification", align: "left" as const },
  { key: "qty", label: "Qty", align: "right" as const },
  { key: "unit", label: "Unit", align: "left" as const },
  { key: "rate", label: "Rate", align: "right" as const },
  { key: "amount", label: "Amount", align: "right" as const },
];

type ColumnKey = (typeof deliveryChallanColumns)[number]["key"];

const margin = 42;
const pageWidth = 595.28;
const contentWidth = pageWidth - margin * 2;
const bottomMargin = 54;
const green = "#1f6f50";
const text = "#1d2520";
const muted = "#5d6b60";
const line = "#d8dfd7";
const band = "#eef3ee";

export async function deliveryChallanPdfBuffer(challan: DeliveryChallan, selectedColumns?: string[]) {
  const columns = normalizedColumns(selectedColumns ?? challan.selected_columns);
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, margin, size: "A4" });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  addPage(doc, true);
  drawIntro(doc, challan);
  drawItems(doc, challan.delivery_challan_items ?? [], columns);
  drawFooter(doc, challan);

  doc.end();
  return done;
}

function normalizedColumns(selected: string[]) {
  const selectedSet = new Set(selected);
  const columns = deliveryChallanColumns.filter((column) => selectedSet.has(column.key));
  return columns.length ? columns : deliveryChallanColumns.slice(0, 4);
}

function addPage(doc: PDFKit.PDFDocument, firstPage = false) {
  doc.addPage({ margin, size: "A4" });
  if (firstPage) {
    doc.rect(0, 0, doc.page.width, 88).fill(green);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(24).text(brand.businessName, margin, 24);
    doc.font("Helvetica").fontSize(9).text(`Contact: ${brand.contactPerson} | ${brand.phone} | ${brand.email}`, margin, 54);
    doc.y = 112;
    return;
  }

  doc.fillColor(green).font("Helvetica-Bold").fontSize(13).text(brand.businessName, margin, 24);
  doc.fillColor(muted).font("Helvetica").fontSize(8).text(`${brand.phone} | ${brand.email}`, margin, 42);
  doc.moveTo(margin, 64).lineTo(pageWidth - margin, 64).strokeColor(line).stroke();
  doc.y = 82;
}

function drawIntro(doc: PDFKit.PDFDocument, challan: DeliveryChallan) {
  doc.fillColor(text).font("Helvetica-Bold").fontSize(18).text("Delivery Challan", margin, 112);
  doc.font("Helvetica").fontSize(9);
  doc.text(`Challan No: ${challan.challan_no}`, 350, 112, { width: 202, align: "right" });
  doc.text(`Date: ${challan.challan_date}`, 350, 128, { width: 202, align: "right" });
  doc.text(`GSTIN: ${brand.gstin}`, 350, 144, { width: 202, align: "right" });

  const boxY = 172;
  doc.roundedRect(margin, boxY, contentWidth, 112, 4).strokeColor(line).stroke();
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("From", margin + 12, boxY + 14);
  doc.font("Helvetica").fontSize(8).fillColor(text).text(brand.address, margin + 12, boxY + 30, { width: 215 });
  doc.font("Helvetica-Bold").fontSize(9).text("Deliver To", margin + 265, boxY + 14);
  doc.font("Helvetica").fontSize(8).text(cleanPdfText(challan.client_name), margin + 265, boxY + 30, { width: 225 });
  doc.text(cleanPdfText(challan.address), margin + 265, boxY + 45, { width: 225 });
  doc.text(`GST: ${challan.gst_number || "-"}`, margin + 265, boxY + 82, { width: 225 });

  doc.fillColor(text).font("Helvetica-Bold").fontSize(10).text(`Project: ${challan.project_name}`, margin, 306, {
    width: contentWidth,
  });
  doc.font("Helvetica").fontSize(8).text(`Transporter: ${challan.transporter || "-"}    Vehicle: ${challan.vehicle_no || "-"}`, margin, 324, {
    width: contentWidth,
  });
  doc.y = 352;
}

function drawItems(
  doc: PDFKit.PDFDocument,
  items: LineItem[],
  columns: ReturnType<typeof normalizedColumns>,
) {
  const widths = columnWidths(columns.map((column) => column.key));
  drawTableHeader(doc, columns, widths);

  for (const item of items) {
    const rowHeight = getRowHeight(doc, item, columns, widths);
    ensureSpace(doc, rowHeight + 4, true, columns, widths);
    drawRow(doc, item, columns, widths, rowHeight);
  }
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  columns: ReturnType<typeof normalizedColumns>,
  widths: number[],
) {
  ensureSpace(doc, 28, false, columns, widths);
  const y = doc.y;
  doc.rect(margin, y, contentWidth, 24).fill(band);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8);
  let x = margin;
  columns.forEach((column, index) => {
    doc.text(column.label, x + 5, y + 8, { width: widths[index] - 10, align: column.align, lineBreak: false });
    x += widths[index];
  });
  doc.y = y + 24;
}

function drawRow(
  doc: PDFKit.PDFDocument,
  item: LineItem,
  columns: ReturnType<typeof normalizedColumns>,
  widths: number[],
  height: number,
) {
  const y = doc.y;
  doc.rect(margin, y, contentWidth, height).strokeColor("#edf0ed").stroke();
  doc.fillColor(text).font("Helvetica").fontSize(7.5);
  let x = margin;
  columns.forEach((column, index) => {
    doc.text(cellValue(item, column.key), x + 5, y + 7, {
      width: widths[index] - 10,
      height: height - 10,
      align: column.align,
      ellipsis: false,
    });
    x += widths[index];
  });
  doc.y = y + height;
}

function getRowHeight(
  doc: PDFKit.PDFDocument,
  item: LineItem,
  columns: ReturnType<typeof normalizedColumns>,
  widths: number[],
) {
  doc.font("Helvetica").fontSize(7.5);
  const heights = columns.map((column, index) =>
    doc.heightOfString(cellValue(item, column.key), { width: widths[index] - 10 }),
  );
  return Math.max(28, Math.ceil(Math.max(...heights) + 14));
}

function drawFooter(doc: PDFKit.PDFDocument, challan: DeliveryChallan) {
  ensureSpace(doc, 120);
  const y = doc.y + 22;
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("Notes", margin, y);
  doc.font("Helvetica").fontSize(8).text(cleanPdfText(challan.notes || "Received the above material in good condition."), margin, y + 16, {
    width: contentWidth,
  });
  doc.font("Helvetica-Bold").fontSize(9).text("Receiver Signature", margin, y + 72);
  doc.text("For Jaydeep Ply", margin + 340, y + 72, { width: 170, align: "right" });
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  requiredHeight: number,
  withHeader = false,
  columns?: ReturnType<typeof normalizedColumns>,
  widths?: number[],
) {
  if (doc.y + requiredHeight <= doc.page.height - bottomMargin) return;
  addPage(doc);
  if (withHeader && columns && widths) drawTableHeader(doc, columns, widths);
}

function columnWidths(keys: ColumnKey[]) {
  const fixed: Record<string, number> = { qty: 50, unit: 54, rate: 78, amount: 84 };
  const fixedTotal = keys.reduce((sum, key) => sum + (fixed[key] ?? 0), 0);
  const flexible = keys.filter((key) => !fixed[key]);
  const flexWidth = flexible.length ? (contentWidth - fixedTotal) / flexible.length : 0;
  return keys.map((key) => fixed[key] ?? flexWidth);
}

function cellValue(item: LineItem, key: string) {
  if (key === "qty") return Number(item.qty || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (key === "rate" || key === "amount") return pdfMoney(Number(item[key as "rate" | "amount"] || 0));
  return cleanPdfText(String(item[key as "description" | "specification" | "unit"] ?? ""));
}

function pdfMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cleanPdfText(value: string) {
  return String(value ?? "")
    .replace(/â‚¹/g, "Rs.")
    .replace(/\u00a0/g, " ")
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€˜â€™]/g, "'")
    .replace(/\s+\n/g, "\n")
    .trim();
}
