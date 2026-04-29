import { AppShell } from "@/components/app-shell";
import { QuotationForm, type ClientOption, type ProductOption } from "@/components/quotation-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ client_id?: string }> }) {
  const { client_id: clientId } = await searchParams;
  const [productOptions, clientOptions] = await Promise.all([loadProductOptions(), loadClientOptions()]);
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">New quotation</h1>
      <p className="mb-6 text-[#5d6b60]">Build a branded quotation with GST split and amount in words.</p>
      <QuotationForm productOptions={productOptions} clientOptions={clientOptions} initialClientId={clientId} />
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
        baseRate: product.base_rate,
        brand: product.brand,
        size: product.size,
        thickness: product.thickness,
        category: product.category,
      }) satisfies ProductOption,
  );
}

async function loadClientOptions() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name, address, gst_number").order("name");

  return ((customers ?? []) as ClientOption[]).map((customer) => ({
    id: customer.id,
    name: customer.name,
    address: customer.address,
    gst_number: customer.gst_number,
  }));
}
