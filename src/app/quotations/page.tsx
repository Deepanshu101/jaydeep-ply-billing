import { AppShell } from "@/components/app-shell";
import { Button, ButtonLink } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import {
  convertToDeliveryChallan,
  convertToInvoice,
  createSalesOrderFromQuotation,
  duplicateQuotation,
  setQuotationStatus,
} from "@/app/actions";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Quotation } from "@/lib/types";

export default async function QuotationsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("quotations").select("*").order("created_at", { ascending: false });
  const quotations = (data ?? []) as Quotation[];

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quotations</h1>
          <p className="text-[#5d6b60]">Create, edit, approve, duplicate, and invoice quotations.</p>
        </div>
        <ButtonLink href="/quotations/new">New quotation</ButtonLink>
      </div>
      <div className="mt-6 overflow-hidden rounded-md border border-[#d8dfd7] bg-white">
        {quotations.length === 0 ? (
          <EmptyState title="No quotations yet" actionHref="/quotations/new" actionLabel="Create quotation" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-[#eef3ee] text-left">
                <tr>
                  {["No.", "Client", "Project", "Date", "Total", "Status", "Actions"].map((heading) => (
                    <th className="px-4 py-3 font-semibold" key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotations.map((quote) => (
                  <tr className="border-t border-[#edf0ed]" key={quote.id}>
                    <td className="px-4 py-3 font-semibold">{quote.quotation_no}</td>
                    <td className="px-4 py-3">{quote.client_name}</td>
                    <td className="px-4 py-3">{quote.project_name}</td>
                    <td className="px-4 py-3">{quote.quote_date}</td>
                    <td className="px-4 py-3">{inr(quote.grand_total)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={quote.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <ButtonLink variant="secondary" href={`/quotations/${quote.id}/edit`}>
                          Edit
                        </ButtonLink>
                        <ButtonLink variant="secondary" href={`/api/quotations/${quote.id}/pdf`}>
                          PDF
                        </ButtonLink>
                        <form action={duplicateQuotation.bind(null, quote.id)}>
                          <Button variant="secondary">Duplicate</Button>
                        </form>
                        {quote.status === "draft" ? (
                          <form action={setQuotationStatus.bind(null, quote.id, "pending_approval")}>
                            <Button variant="secondary">Send approval</Button>
                          </form>
                        ) : null}
                        {quote.status === "pending_approval" ? (
                          <form action={setQuotationStatus.bind(null, quote.id, "approved")}>
                            <Button>Approve</Button>
                          </form>
                        ) : null}
                        {quote.status === "approved" ? (
                          <form action={createSalesOrderFromQuotation.bind(null, quote.id)}>
                            <Button variant="secondary">Create PO</Button>
                          </form>
                        ) : null}
                        {quote.status === "approved" ? (
                          <form action={convertToDeliveryChallan.bind(null, quote.id)}>
                            <Button variant="secondary">Challan</Button>
                          </form>
                        ) : null}
                        {quote.status === "approved" ? (
                          <form action={convertToInvoice.bind(null, quote.id)}>
                            <Button>Convert</Button>
                          </form>
                        ) : null}
                      </div>
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
