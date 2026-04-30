import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { QuotationForm, type ClientOption, type ProductOption } from "@/components/quotation-form";
import { QuotationShareActions } from "@/components/quotation-share-actions";
import { loadClientOptionsWithFallback } from "@/lib/client-options";
import { createClient } from "@/lib/supabase/server";
import type { Quotation } from "@/lib/types";

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, productOptions, clientOptions] = await Promise.all([
    supabase.from("quotations").select("*, quotation_items(*)").eq("id", id).single(),
    loadProductOptions(),
    loadClientOptions(),
  ]);
  if (!data) notFound();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const pdfUrl = `${siteUrl.replace(/\/$/, "")}/api/quotations/${id}/pdf`;

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Edit quotation</h1>
          <p className="text-[#5d6b60]">{data.quotation_no}</p>
        </div>
        <QuotationShareActions
          quotationId={data.id}
          customerId={data.customer_id}
          quotationNo={data.quotation_no}
          clientName={data.client_name}
          projectName={data.project_name}
          grandTotal={data.grand_total}
          pdfUrl={pdfUrl}
        />
      </div>
      <QuotationForm quotation={data as Quotation} productOptions={productOptions} clientOptions={clientOptions} />
    </AppShell>
  );
}

async function loadClientOptions() {
  const customers = await loadClientOptionsWithFallback();
  return (customers as ClientOption[]).map((customer) => ({
    id: customer.id,
    name: customer.name,
    address: customer.address,
    gst_number: customer.gst_number,
  }));
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
