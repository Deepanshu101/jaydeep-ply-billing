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
const softLine = "#e8ede7";
const light = "#f6f8f4";
const band = "#eef3ee";
const accent = "#edf6f0";

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
  doc.y = firstPage ? 150 : 108;
}

function drawHeader(doc: PDFKit.PDFDocument, firstPage: boolean) {
  doc.rect(0, 0, pageWidth, firstPage ? 122 : 84).fill(firstPage ? green : "white");

  if (firstPage) {
    doc.circle(margin + 18, 40, 18).fill("white");
    doc.fillColor(green).font("Helvetica-Bold").fontSize(13).text("JP", margin + 8, 32, { width: 20, align: "center" });
    doc.fillColor("white").font("Helvetica-Bold").fontSize(25).text(brand.businessName, margin + 46, 22);
    doc.fillColor("white").font("Helvetica").fontSize(9).text("Plywood, laminates, doors, hardware, and project material supply", margin + 46, 49);
    doc.font("Helvetica").fontSize(8.5).text(`Contact Person: ${brand.contactPerson}`, margin + 46, 68);
    doc.text(`${brand.phone} | ${brand.email}`, margin + 46, 82);
    doc.text(`GSTIN: ${brand.gstin}`, margin + 46, 96);

    doc.roundedRect(pageWidth - margin - 146, 24, 146, 54, 4).strokeColor("#ffffff").stroke();
    doc.fillColor("white").font("Helvetica-Bold").fontSize(16).text("QUOTATION", pageWidth - margin - 138, 34, {
      width: 130,
      align: "center",
    });
    doc.font("Helvetica").fontSize(8.5).text("Commercial Offer", pageWidth - margin - 138, 56, {
      width: 130,
      align: "center",
    });
    doc.fillColor("#d7efe4").font("Helvetica").fontSize(7.8).text(brand.address, margin, 118, {
      width: contentWidth,
      align: "left",
    });
    return;
  }

  doc.fillColor(green).font("Helvetica-Bold").fontSize(13).text(brand.businessName, margin, 22);
  doc.fillColor(muted).font("Helvetica").fontSize(8).text(`${brand.phone} | ${brand.email} | GSTIN: ${brand.gstin}`, margin, 40);
  doc.moveTo(margin, 74).lineTo(pageWidth - margin, 74).strokeColor(line).stroke();
}

function drawIntro(doc: PDFKit.PDFDocument, quotation: Quotation) {
  const top = doc.y;
  const leftWidth = 238;
  const middleWidth = 150;
  const gap = 14;
  const rightX = margin + leftWidth + gap + middleWidth + gap;
  const rightWidth = contentWidth - leftWidth - middleWidth - gap * 2;
  const middleX = margin + leftWidth + gap;
  const cardHeight = 116;

  sectionLabel(doc, "Client", margin, top);
  infoCard(doc, margin, top + 16, leftWidth, cardHeight, "Prepared For");
  doc.fillColor(text).font("Helvetica-Bold").fontSize(10).text(cleanPdfText(quotation.client_name), margin + 12, top + 31, {
    width: leftWidth - 24,
  });
  doc.fillColor(muted).font("Helvetica").fontSize(8.2).text(cleanPdfText(quotation.address), margin + 12, top + 49, {
    width: leftWidth - 24,
    height: 40,
  });
  doc.fillColor(text).font("Helvetica").fontSize(8).text(`GSTIN: ${quotation.gst_number || "-"}`, margin + 12, top + 92, {
    width: leftWidth - 24,
  });

  sectionLabel(doc, "Site", middleX, top);
  infoCard(doc, middleX, top + 16, middleWidth, cardHeight, quotation.ship_to_enabled ? "Delivery / Site" : "Project");
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8.8).text(
    cleanPdfText(quotation.ship_to_enabled ? quotation.ship_to_name || quotation.client_name : quotation.project_name),
    middleX + 12,
    top + 31,
    { width: middleWidth - 24 },
  );
  doc.fillColor(muted).font("Helvetica").fontSize(7.8).text(
    cleanPdfText(quotation.ship_to_enabled ? quotation.ship_to_address || quotation.address : quotation.project_name),
    middleX + 12,
    top + 49,
    { width: middleWidth - 24, height: 48 },
  );
  doc.fillColor(text).font("Helvetica").fontSize(7.8).text(
    `Ship GSTIN: ${quotation.ship_to_enabled ? quotation.ship_to_gst_number || quotation.gst_number || "-" : "-"}`,
    middleX + 12,
    top + 94,
    { width: middleWidth - 24 },
  );

  sectionLabel(doc, "Reference", rightX, top);
  infoCard(doc, rightX, top + 16, rightWidth, cardHeight, "Quotation Details");
  detailRow(doc, "Quotation No.", quotation.quotation_no, rightX + 12, top + 31, rightWidth - 24);
  detailRow(doc, "Date", formatDate(quotation.quote_date), rightX + 12, top + 50, rightWidth - 24);
  detailRow(doc, "Project", cleanPdfText(quotation.project_name), rightX + 12, top + 69, rightWidth - 24);
  detailRow(doc, "Prepared By", brand.contactPerson, rightX + 12, top + 88, rightWidth - 24);
  detailRow(doc, "Validity", "15 days from quotation date", rightX + 12, top + 107, rightWidth - 24);

  const fromY = top + 146;
  doc.roundedRect(margin, fromY, contentWidth, 52, 4).fillAndStroke(accent, line);
  doc.fillColor(deepGreen).font("Helvetica-Bold").fontSize(9).text("Commercial Offer", margin + 12, fromY + 10);
  doc.fillColor(text)
    .font("Helvetica")
    .fontSize(8)
    .text(
      "We thank you for the opportunity and submit our quotation for your review. The proposal below is arranged for quick approval, execution planning, and coordinated material supply.",
      margin + 110,
      fromY + 10,
      { width: contentWidth - 122, height: 28 },
    );

  doc.y = fromY + 72;
}

function detailRow(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.fillColor(muted).font("Helvetica").fontSize(8).text(label, x, y, { width: 78 });
  doc.fillColor(text).font("Helvetica-Bold").fontSize(8).text(value || "-", x + 82, y, { width: width - 82, align: "right" });
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
  ensureSpace(doc, 270);
  doc.y += 16;
  const y = doc.y;
  const termsWidth = 292;
  const totalsX = margin + termsWidth + 20;
  const totalsWidth = contentWidth - termsWidth - 20;

  doc.roundedRect(margin, y, termsWidth, 128, 4).fillAndStroke("#fbfcfa", line);
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text("Terms & Conditions", margin + 12, y + 12);
  doc.fillColor(text).font("Helvetica").fontSize(7.6).text(buildTermsText(quotation.terms), margin + 12, y + 28, {
    width: termsWidth - 24,
    height: 90,
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

  doc.y = Math.max(y + 144, rowY + 46);
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
  ensureSpace(doc, 108);
  const closeY = doc.y;
  doc.roundedRect(margin, closeY, contentWidth, 96, 4).strokeColor(line).stroke();
  doc.fillColor(deepGreen).font("Helvetica-Bold").fontSize(9).text("Execution Support", margin + 12, closeY + 12);
  doc.fillColor(text)
    .font("Helvetica")
    .fontSize(8)
    .text(
      "On receipt of your approval, we can assist with rate confirmation, material blocking, dispatch coordination, and revised commercial submission if required for your site process.",
      margin + 12,
      closeY + 28,
      { width: 308 },
    );
  doc.roundedRect(pageWidth - margin - 170, closeY + 14, 158, 68, 4).strokeColor(line).stroke();
  doc.fillColor(text).font("Helvetica").fontSize(8).text("For Jaydeep Ply", pageWidth - margin - 162, closeY + 24, {
    width: 142,
    align: "center",
  });
  doc.fillColor(muted).font("Helvetica").fontSize(7.2).text("Authorised Signatory / Stamp", pageWidth - margin - 162, closeY + 54, {
    width: 142,
    align: "center",
  });
  doc.fillColor(text).font("Helvetica-Bold").fontSize(9).text(brand.contactPerson, pageWidth - margin - 162, closeY + 68, {
    width: 142,
    align: "center",
  });
  doc.y = closeY + 106;
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
      .text("Jaydeep Ply | Timely material support | Clear billing | Site-focused service", margin, pageHeight - 58, {
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

function sectionLabel(doc: PDFKit.PDFDocument, label: string, x: number, y: number) {
  doc.fillColor(deepGreen).font("Helvetica-Bold").fontSize(8.2).text(label.toUpperCase(), x, y);
}

function infoCard(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, title: string) {
  doc.roundedRect(x, y, width, height, 4).fillAndStroke("white", line);
  doc.rect(x, y, width, 16).fillAndStroke(accent, line);
  doc.fillColor(deepGreen).font("Helvetica-Bold").fontSize(7.8).text(title, x + 10, y + 5, {
    width: width - 20,
  });
}

function buildTermsText(value: string) {
  const base = cleanPdfText(value);
  const extras = [
    "Delivery schedule will be coordinated subject to order confirmation and material availability.",
    "Payment terms and unloading scope shall apply as mutually agreed before dispatch.",
    "Any statutory tax revision, transport escalation, or special handling requirement will be charged extra where applicable.",
    "MSME and compliance documents can be shared on request at the order finalisation stage.",
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
