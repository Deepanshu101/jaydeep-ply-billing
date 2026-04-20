import { createPricingRule, updateProductRate } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/button";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  unit: string;
  base_rate: number | null;
  gst_percent: number;
};

type RuleRow = {
  id: string;
  product_id: string | null;
  category: string | null;
  brand: string | null;
  margin_percent: number;
  is_active: boolean;
  products?: { name: string } | { name: string }[] | null;
};

export default async function PricingPage() {
  const supabase = await createClient();
  const [{ data: products }, { data: rules }] = await Promise.all([
    supabase.from("products").select("id, name, brand, category, unit, base_rate, gst_percent").order("name").limit(100),
    supabase.from("pricing_rules").select("*, products(name)").order("created_at", { ascending: false }).limit(50),
  ]);
  const productRows = (products ?? []) as ProductRow[];
  const ruleRows = (rules ?? []) as RuleRow[];

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Pricing Intelligence</p>
        <h1 className="mt-1 text-3xl font-bold">Rates, margins, and safe selling logic</h1>
        <p className="mt-2 text-[#5d6b60]">Control product base rates and margin rules used by BOQ imports and quotation drafts.</p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-md border border-[#d8dfd7] bg-white p-4 shadow-sm">
          <h2 className="text-xl font-bold">Add margin rule</h2>
          <form action={createPricingRule} className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm font-semibold">Product</span>
              <select name="product_id" className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2">
                <option value="">Any product</option>
                {productRows.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Brand" name="brand" placeholder="Greenply" />
            <Field label="Category" name="category" placeholder="plywood" />
            <Field label="Margin %" name="margin_percent" type="number" step="0.01" defaultValue="15" required />
            <Button>Create rule</Button>
          </form>
          <div className="mt-6 space-y-2">
            <h3 className="font-bold">Active rules</h3>
            {ruleRows.length ? (
              ruleRows.map((rule) => (
                <div className="rounded-md bg-[#f6f7f4] p-3 text-sm" key={rule.id}>
                  <p className="font-semibold">{productName(rule.products) || rule.brand || rule.category || "Default scope"}</p>
                  <p className="text-[#5d6b60]">Margin {rule.margin_percent}%</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#5d6b60]">No pricing rules yet.</p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-[#d8dfd7] bg-white shadow-sm">
          <div className="border-b border-[#d8dfd7] p-4">
            <h2 className="text-xl font-bold">Product rate memory</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-[#eef3ee] text-left">
                <tr>
                  {["Product", "Brand", "Category", "Base rate", "GST", "Safe rate @15%", "Update"].map((heading) => (
                    <th className="px-3 py-3 font-semibold" key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productRows.map((product) => (
                  <tr className="border-t border-[#edf0ed]" key={product.id}>
                    <td className="px-3 py-3 font-semibold">{product.name}</td>
                    <td className="px-3 py-3">{product.brand || "-"}</td>
                    <td className="px-3 py-3">{product.category || "-"}</td>
                    <td className="px-3 py-3">{inr(Number(product.base_rate || 0))}</td>
                    <td className="px-3 py-3">{product.gst_percent}%</td>
                    <td className="px-3 py-3 font-semibold">{inr(Number(product.base_rate || 0) * 1.15)}</td>
                    <td className="px-3 py-3">
                      <form action={updateProductRate} className="flex gap-2">
                        <input type="hidden" name="product_id" value={product.id} />
                        <input className="w-28 rounded-md border border-[#cdd6cf] px-2 py-1" name="base_rate" type="number" step="0.01" defaultValue={product.base_rate ?? 0} />
                        <input className="w-20 rounded-md border border-[#cdd6cf] px-2 py-1" name="gst_percent" type="number" step="0.01" defaultValue={product.gst_percent} />
                        <Button variant="secondary">Save</Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" {...inputProps} />
    </label>
  );
}

function productName(products: RuleRow["products"]) {
  if (Array.isArray(products)) return products[0]?.name;
  return products?.name;
}
