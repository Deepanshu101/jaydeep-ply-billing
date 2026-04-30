import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/types";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
  const invoices = (data ?? []) as Invoice[];

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-[#5d6b60]">Create direct invoices or export invoice entries for TallyPrime XML.</p>
        </div>
        <ButtonLink href="/invoices/new">New invoice</ButtonLink>
      </div>
      <div className="mt-6 overflow-hidden rounded-md border border-[#d8dfd7] bg-white">
        {invoices.length === 0 ? (
          <EmptyState title="No invoices yet" actionHref="/invoices/new" actionLabel="Create direct invoice" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-[#eef3ee] text-left">
                <tr>
                {["No.", "Client", "Project", "Date", "Sync", "Total", "Actions"].map((heading) => (
                    <th className="px-4 py-3 font-semibold" key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr className="border-t border-[#edf0ed]" key={invoice.id}>
                    <td className="px-4 py-3 font-semibold">{invoice.invoice_no}</td>
                    <td className="px-4 py-3">{invoice.client_name}</td>
                    <td className="px-4 py-3">{invoice.project_name}</td>
                    <td className="px-4 py-3">{invoice.invoice_date}</td>
                    <td className="px-4 py-3">{invoice.tally_sync_status || "not_synced"}</td>
                    <td className="px-4 py-3">{inr(invoice.grand_total)}</td>
                    <td className="flex gap-2 px-4 py-3">
                      <ButtonLink variant="secondary" href={`/invoices/${invoice.id}`}>
                        Open
                      </ButtonLink>
                      <ButtonLink href={`/invoices/${invoice.id}/edit`}>
                        Edit
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
