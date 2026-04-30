import { AppShell } from "@/components/app-shell";
import { InvoiceForm, type InvoiceClientOption, type InvoiceProductOption } from "@/components/invoice-form";
import { loadClientOptionsWithFallback } from "@/lib/client-options";
import { createClient } from "@/lib/supabase/server";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client_id?: string }> }) {
  const { client_id: clientId } = await searchParams;
  const [productOptions, clientOptions] = await Promise.all([loadProductOptions(), loadClientOptions()]);

  return (
    <AppShell>
      <h1 className="text-3xl font-bold">New invoice</h1>
      <p className="mb-6 text-[#5d6b60]">Create a direct invoice without first making a quotation.</p>
      <InvoiceForm productOptions={productOptions} clientOptions={clientOptions} initialClientId={clientId} />
    </AppShell>
  );
}

async function loadProductOptions() {
  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, unit, base_rate, brand, size, thickness, category")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`Could not load product list: ${error.message}`);

  return ((products ?? []) as {
    id: string;
    name: string;
    unit: string;
    base_rate: number | null;
    brand: string | null;
    size: string | null;
    thickness: string | null;
    category: string | null;
  }[]).map(
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
      }) satisfies InvoiceProductOption,
  );
}

async function loadClientOptions() {
  const customers = await loadClientOptionsWithFallback();
  return (customers as InvoiceClientOption[]).map((customer) => ({
    id: customer.id,
    name: customer.name,
    address: customer.address,
    gst_number: customer.gst_number,
  }));
}
