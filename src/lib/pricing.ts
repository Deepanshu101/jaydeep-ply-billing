import type { ImportRow, PricingRule, Product } from "./types";

export function applyPricing(rows: ImportRow[], products: Product[] = [], rules: PricingRule[] = []) {
  const defaultMargin = Number(process.env.DEFAULT_IMPORT_MARGIN_PERCENT ?? 15);

  return rows.map((row) => {
    const product = products.find((item) => item.id === row.matched_product_id);
    const baseRate = Number(row.rate || product?.base_rate || 0);
    if (!baseRate) return row;

    const rule = findPricingRule(row, product, rules);
    const margin = rule?.margin_percent ?? defaultMargin;
    const rate = round(baseRate * (1 + margin / 100));
    const qty = Number(row.qty || 1);

    return {
      ...row,
      rate,
      amount: round(qty * rate),
      unit: row.unit || product?.unit || "Nos",
      brand: row.brand ?? product?.brand ?? null,
      category: row.category ?? product?.category ?? null,
      size: row.size ?? product?.size ?? null,
      thickness: row.thickness ?? product?.thickness ?? null,
    };
  });
}

function findPricingRule(row: ImportRow, product: Product | undefined, rules: PricingRule[]) {
  return rules.find((rule) => {
    if (!rule.is_active) return false;
    if (rule.product_id && product?.id !== rule.product_id) return false;
    if (rule.category && rule.category !== (row.category ?? product?.category)) return false;
    if (rule.brand && rule.brand !== (row.brand ?? product?.brand)) return false;
    return true;
  });
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
