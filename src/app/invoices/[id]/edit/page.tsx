import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/button";
import { InvoiceForm, type InvoiceProductOption } from "@/components/invoice-form";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/types";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data, error }, productOptions] = await Promise.all([
    supabase.from("invoices").select("*, invoice_items(*)").eq("id", id).single(),
    loadProductOptions(),
  ]);
  if (error) throw new Error(`Could not load invoice: ${error.message}`);
  if (!data) notFound();
  const invoice = data as Invoice;

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Invoice Editing</p>
          <h1 className="mt-1 text-3xl font-bold">Edit {invoice.invoice_no}</h1>
          <p className="text-[#5d6b60]">Tally-style billing screen with editable inventory rows and live totals.</p>
        </div>
        <ButtonLink variant="secondary" href={`/invoices/${invoice.id}`}>
          Back to invoice
        </ButtonLink>
      </div>
      <InvoiceForm invoice={invoice} productOptions={productOptions} />
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
