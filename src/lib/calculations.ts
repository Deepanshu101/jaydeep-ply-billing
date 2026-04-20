import { amountInWords } from "./money";
import type { LineItem } from "./types";

export function calculateTotals(items: LineItem[], gstPercent: number, discountValue = 0, discountType: "amount" | "percent" = "amount") {
  const normalized = items.map((item) => ({
    ...item,
    qty: Number(item.qty) || 0,
    rate: Number(item.rate) || 0,
    amount: round((Number(item.qty) || 0) * (Number(item.rate) || 0)),
  }));
  const subtotal = round(normalized.reduce((sum, item) => sum + item.amount, 0));
  const discount_amount = round(
    discountType === "percent" ? (subtotal * Math.max(0, Number(discountValue) || 0)) / 100 : Math.max(0, Number(discountValue) || 0),
  );
  const taxableSubtotal = round(Math.max(0, subtotal - discount_amount));
  const gst = round((taxableSubtotal * (Number(gstPercent) || 0)) / 100);
  const cgst = round(gst / 2);
  const sgst = round(gst - cgst);
  const grandTotal = round(taxableSubtotal + gst);

  return {
    items: normalized,
    subtotal,
    discount_type: discountType,
    discount_value: Number(discountValue) || 0,
    discount_amount,
    taxable_subtotal: taxableSubtotal,
    gst_percent: Number(gstPercent) || 0,
    cgst,
    sgst,
    grand_total: grandTotal,
    amount_in_words: amountInWords(grandTotal),
  };
}

export function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
