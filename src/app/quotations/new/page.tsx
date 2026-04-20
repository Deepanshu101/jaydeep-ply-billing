import { AppShell } from "@/components/app-shell";
import { QuotationForm, type ProductOption } from "@/components/quotation-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewQuotationPage() {
  const productOptions = await loadProductOptions();
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">New quotation</h1>
      <p className="mb-6 text-[#5d6b60]">Build a branded quotation with GST split and amount in words.</p>
      <QuotationForm productOptions={productOptions} />
    </AppShell>
  );
}

async function loadProductOptions() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, unit, base_rate, brand, size, thickness, category")
    .eq("is_active", true)
    .order("name");

  return ((products ?? []) as { id: string; name: string; unit: string; base_rate: number | null; brand: string | null; size: string | null; thickness: string | null; category: string | null }[]).map(
    (product) =>
      ({
        id: product.id,
        name: product.name,
        unit: product.unit,
        rate: product.base_rate,
        brand: product.brand,
        size: product.size,
        thickness: product.thickness,
        category: product.category,
      }) satisfies ProductOption,
  );
}
