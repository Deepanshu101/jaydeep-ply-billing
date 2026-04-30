import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/button";
import { TallyPushButton } from "@/components/tally-push-button";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { stripTallyItemMeta } from "@/lib/tally-item-meta";
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
          <ButtonLink variant="secondary" href={`/api/invoices/${invoice.id}/pdf`} target="_blank">
            Download PDF
          </ButtonLink>
          <ButtonLink variant="secondary" href={`/api/invoices/${invoice.id}/tally`}>
            Export Tally XML
          </ButtonLink>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Invoice Date" value={invoice.invoice_date} />
            <MetricCard label="Due Date" value={invoice.due_date || "-"} />
            <MetricCard label="Tally Sync" value={invoice.tally_sync_status || "not_synced"} />
            <MetricCard label="Grand Total" value={inr(invoice.grand_total)} strong />
          </section>

          <section className="rounded-md border border-[#d8dfd7] bg-white p-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border border-[#d8dfd7] bg-[#fbfcfa] p-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Billing Party</p>
                <p className="mt-3 text-lg font-bold">{invoice.client_name}</p>
                <p className="mt-2 whitespace-pre-line text-sm text-[#445147]">{invoice.address}</p>
                <p className="mt-3 text-sm"><span className="font-semibold">GST:</span> {invoice.gst_number || "-"}</p>
              </div>
              <div className="rounded-md border border-[#d8dfd7] bg-[#fbfcfa] p-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Consignee / Ship To</p>
                <p className="mt-3 text-lg font-bold">{invoice.ship_to_enabled ? invoice.ship_to_name || invoice.client_name : invoice.client_name}</p>
                <p className="mt-2 whitespace-pre-line text-sm text-[#445147]">
                  {invoice.ship_to_enabled ? invoice.ship_to_address || invoice.address : invoice.address}
                </p>
                <p className="mt-3 text-sm"><span className="font-semibold">GST:</span> {invoice.ship_to_enabled ? invoice.ship_to_gst_number || invoice.gst_number || "-" : invoice.gst_number || "-"}</p>
              </div>
              <div className="rounded-md border border-[#d8dfd7] bg-[#fbfcfa] p-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Billing Details</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="font-semibold">Project:</span> {invoice.project_name}</p>
                  <p><span className="font-semibold">Invoice No.:</span> {invoice.invoice_no}</p>
                  <p><span className="font-semibold">Invoice Date:</span> {invoice.invoice_date}</p>
                  <p><span className="font-semibold">Due Date:</span> {invoice.due_date || "-"}</p>
                </div>
              </div>
              <div className="rounded-md border border-[#d8dfd7] bg-[#fbfcfa] p-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Dispatch / Order</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="font-semibold">Dispatch Doc No.:</span> {invoice.dispatch_doc_no || "-"}</p>
                  <p><span className="font-semibold">Dispatch Date:</span> {invoice.dispatch_date || "-"}</p>
                  <p><span className="font-semibold">Dispatched Through:</span> {invoice.dispatched_through || "-"}</p>
                  <p><span className="font-semibold">Destination:</span> {invoice.destination || "-"}</p>
                  <p><span className="font-semibold">Carrier / Agent:</span> {invoice.carrier_name || "-"}</p>
                  <p><span className="font-semibold">Vehicle No.:</span> {invoice.vehicle_no || "-"}</p>
                  <p><span className="font-semibold">Order No.:</span> {invoice.order_no || "-"}</p>
                  <p><span className="font-semibold">Terms of Payment:</span> {invoice.payment_terms || "-"}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-[#d8dfd7] bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Invoice Items</h2>
                <p className="text-sm text-[#5d6b60]">Review the billing rows exactly as they will be sent for invoicing.</p>
              </div>
              <ButtonLink variant="secondary" href={`/invoices/${invoice.id}/edit`}>
                Edit rows
              </ButtonLink>
            </div>
            <div className="overflow-x-auto">
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
                  <td className="px-3 py-2">{stripTallyItemMeta(item.specification)}</td>
                  <td className="px-3 py-2">{item.qty}</td>
                  <td className="px-3 py-2">{item.unit}</td>
                  <td className="px-3 py-2">{inr(item.rate)}</td>
                  <td className="px-3 py-2">{inr(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <TallyPushButton invoiceId={invoice.id} projectName={invoice.project_name} />

          <section className="rounded-md border border-[#d8dfd7] bg-white p-4">
            <h2 className="text-lg font-bold">Totals</h2>
            <div className="mt-4 space-y-2">
              <Row label="Subtotal" value={inr(invoice.subtotal)} />
              {(invoice.discount_amount ?? 0) > 0 ? <Row label="Discount" value={`-${inr(invoice.discount_amount ?? 0)}`} /> : null}
              <Row label={`CGST (${invoice.gst_percent / 2}%)`} value={inr(invoice.cgst)} />
              <Row label={`SGST (${invoice.gst_percent / 2}%)`} value={inr(invoice.sgst)} />
              <Row label="Grand total" value={inr(invoice.grand_total)} strong />
            </div>
            <div className="mt-4 rounded-md border border-[#d8dfd7] bg-[#f8faf7] p-3 text-sm">
              <p className="font-semibold">Amount in words</p>
              <p className="mt-2 text-[#445147]">{invoice.amount_in_words}</p>
            </div>
          </section>

          <section className="rounded-md border border-[#d8dfd7] bg-white p-4">
            <h2 className="text-lg font-bold">Terms and Narration</h2>
            <p className="mt-3 whitespace-pre-line text-sm text-[#445147]">{invoice.terms || "-"}</p>
          </section>
        </div>
      </div>
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

function MetricCard({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md border px-4 py-3 ${strong ? "border-[#1f6f50] bg-[#1f6f50] text-white" : "border-[#d8dfd7] bg-white text-[#1d2520]"}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${strong ? "text-white/85" : "text-[#5d6b60]"}`}>{label}</p>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  );
}
