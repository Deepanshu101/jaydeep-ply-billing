import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/button";
import { TallyPushButton } from "@/components/tally-push-button";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/types";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select("*, invoice_items(*)").eq("id", id).single();
  if (!data) notFound();
  const invoice = data as Invoice;

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{invoice.invoice_no}</h1>
          <p className="text-[#5d6b60]">{invoice.client_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/invoices/${invoice.id}/edit`}>
            Edit invoice
          </ButtonLink>
          <ButtonLink variant="secondary" href={`/api/invoices/${invoice.id}/tally`}>
            Export Tally XML
          </ButtonLink>
        </div>
      </div>
      <div className="mb-6">
        <TallyPushButton invoiceId={invoice.id} projectName={invoice.project_name} />
      </div>
      <section className="rounded-md border border-[#d8dfd7] bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <p>
            <span className="font-semibold">Project:</span> {invoice.project_name}
          </p>
          <p>
            <span className="font-semibold">Date:</span> {invoice.invoice_date}
          </p>
          <p>
            <span className="font-semibold">Due date:</span> {invoice.due_date || "-"}
          </p>
          <p>
            <span className="font-semibold">Tally sync:</span> {invoice.tally_sync_status || "not_synced"}
          </p>
          <p className="sm:col-span-2">
            <span className="font-semibold">Address:</span> {invoice.address}
          </p>
          <p>
            <span className="font-semibold">GST:</span> {invoice.gst_number || "-"}
          </p>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="bg-[#eef3ee] text-left">
              <tr>
                {["Description", "Specification", "Qty", "Unit", "Rate", "Amount"].map((heading) => (
                  <th className="px-3 py-3" key={heading}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.invoice_items?.map((item, index) => (
                <tr className="border-t border-[#edf0ed]" key={index}>
                  <td className="px-3 py-2">{item.description}</td>
                  <td className="px-3 py-2">{item.specification}</td>
                  <td className="px-3 py-2">{item.qty}</td>
                  <td className="px-3 py-2">{item.unit}</td>
                  <td className="px-3 py-2">{inr(item.rate)}</td>
                  <td className="px-3 py-2">{inr(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto mt-6 max-w-sm space-y-2">
          <Row label="Subtotal" value={inr(invoice.subtotal)} />
          {(invoice.discount_amount ?? 0) > 0 ? <Row label="Discount" value={`-${inr(invoice.discount_amount ?? 0)}`} /> : null}
          <Row label={`CGST (${invoice.gst_percent / 2}%)`} value={inr(invoice.cgst)} />
          <Row label={`SGST (${invoice.gst_percent / 2}%)`} value={inr(invoice.sgst)} />
          <Row label="Grand total" value={inr(invoice.grand_total)} strong />
        </div>
      </section>
    </AppShell>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between rounded-md px-3 py-2 ${strong ? "bg-[#1f6f50] text-white" : "bg-[#f6f7f4]"}`}>
      <span>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
