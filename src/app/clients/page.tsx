import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  payment_terms_days: number;
  price_sensitivity: string;
  risk_level: string;
};

export default async function ClientsPage() {
  const supabase = await createClient();
  const [{ data, count }, { data: quotations }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, email, gst_number, payment_terms_days, price_sensitivity, risk_level", { count: "exact" })
      .order("name")
      .range(0, 999),
    supabase.from("quotations").select("customer_id, grand_total"),
  ]);
  const quotedTotals = new Map<string, number>();
  for (const quote of quotations ?? []) {
    const customerId = quote.customer_id as string | null;
    if (!customerId) continue;
    quotedTotals.set(customerId, (quotedTotals.get(customerId) ?? 0) + Number(quote.grand_total || 0));
  }
  const customers = (data ?? []) as CustomerRow[];

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Client Memory</p>
        <h1 className="mt-1 text-3xl font-bold">Clients that remember themselves</h1>
        <p className="mt-2 text-[#5d6b60]">Payment terms, brand preference, sensitivity, risk, quotations, and invoice value.</p>
        <p className="mt-2 text-sm font-semibold text-[#1f6f50]">
          Showing {customers.length} of {count ?? customers.length} synced client(s)
        </p>
      </div>
      <div className="overflow-hidden rounded-md border border-[#d8dfd7] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-[#eef3ee] text-left">
              <tr>
                {["Client", "Phone", "GST", "Terms", "Sensitivity", "Risk", "Lifetime quoted", "Actions"].map((heading) => (
                  <th className="px-4 py-3 font-semibold" key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <ClientRow key={customer.id} customer={customer} total={quotedTotals.get(customer.id) ?? 0} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {(count ?? 0) > customers.length ? (
        <p className="mt-3 text-sm text-[#8a5b00]">
          More than 1000 clients are synced. Search/pagination should be added next for fast office use.
        </p>
      ) : null}
    </AppShell>
  );
}

function ClientRow({ customer, total }: { customer: CustomerRow; total: number }) {
  return (
    <tr className="border-t border-[#edf0ed]">
      <td className="px-4 py-3 font-semibold">{customer.name}</td>
      <td className="px-4 py-3">{customer.phone || "-"}</td>
      <td className="px-4 py-3">{customer.gst_number || "-"}</td>
      <td className="px-4 py-3">{customer.payment_terms_days} days</td>
      <td className="px-4 py-3">{customer.price_sensitivity}</td>
      <td className="px-4 py-3">{customer.risk_level}</td>
      <td className="px-4 py-3">{inr(total)}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded-md bg-[#1f6f50] px-3 py-2 text-xs font-semibold text-white"
            href={`/quotations/new?client_id=${customer.id}`}
          >
            New quotation
          </Link>
          <Link
            className="rounded-md border border-[#cdd6cf] px-3 py-2 text-xs font-semibold text-[#1f6f50]"
            href={`/clients/${customer.id}`}
          >
            Previous
          </Link>
          <a
            className={`rounded-md border border-[#cdd6cf] px-3 py-2 text-xs font-semibold ${
              customer.email ? "text-[#1f6f50]" : "pointer-events-none text-[#9aa49d]"
            }`}
            href={customer.email ? `mailto:${customer.email}?subject=${encodeURIComponent("Jaydeep Ply")}` : "#"}
          >
            Mail
          </a>
          {customer.phone ? (
            <a
              className="rounded-md border border-[#cdd6cf] px-3 py-2 text-xs font-semibold text-[#1f6f50]"
              href={`https://wa.me/91${customer.phone.replace(/\D/g, "").slice(-10)}`}
              target="_blank"
            >
              WhatsApp
            </a>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
