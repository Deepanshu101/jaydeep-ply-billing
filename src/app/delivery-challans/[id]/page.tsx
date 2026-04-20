import { notFound } from "next/navigation";
import { updateDeliveryChallanDetails } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Button, ButtonLink } from "@/components/button";
import { deliveryChallanColumns } from "@/lib/delivery-challan-pdf";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryChallan } from "@/lib/types";

export default async function DeliveryChallanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("delivery_challans").select("*, delivery_challan_items(*)").eq("id", id).single();
  if (!data) notFound();
  const challan = data as DeliveryChallan;
  const selected = new Set(challan.selected_columns ?? ["description", "specification", "qty", "unit"]);
  const pdfHref = `/api/delivery-challans/${challan.id}/pdf?columns=${encodeURIComponent([...selected].join(","))}`;

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{challan.challan_no}</h1>
          <p className="text-[#5d6b60]">{challan.client_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="secondary" href="/delivery-challans">All challans</ButtonLink>
          <ButtonLink href={pdfHref}>Download PDF</ButtonLink>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded-md border border-[#d8dfd7] bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <p><span className="font-semibold">Project:</span> {challan.project_name}</p>
            <p><span className="font-semibold">Date:</span> {challan.challan_date}</p>
            <p><span className="font-semibold">Transporter:</span> {challan.transporter || "-"}</p>
            <p><span className="font-semibold">Vehicle:</span> {challan.vehicle_no || "-"}</p>
            <p className="sm:col-span-2"><span className="font-semibold">Address:</span> {challan.address}</p>
            <p><span className="font-semibold">GST:</span> {challan.gst_number || "-"}</p>
            <p className="capitalize"><span className="font-semibold">Status:</span> {challan.status}</p>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-[#eef3ee] text-left">
                <tr>
                  {["Description", "Specification", "Qty", "Unit", "Rate", "Amount"].map((heading) => (
                    <th className="px-3 py-3" key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {challan.delivery_challan_items?.map((item, index) => (
                  <tr className="border-t border-[#edf0ed]" key={index}>
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="px-3 py-2">{item.specification}</td>
                    <td className="px-3 py-2">{item.qty}</td>
                    <td className="px-3 py-2">{item.unit}</td>
                    <td className="px-3 py-2">{inr(Number(item.rate || 0))}</td>
                    <td className="px-3 py-2">{inr(Number(item.amount || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form action={updateDeliveryChallanDetails} className="rounded-md border border-[#d8dfd7] bg-white p-4">
          <input type="hidden" name="challan_id" value={challan.id} />
          <h2 className="text-xl font-bold">PDF options</h2>
          <label className="mt-4 block text-sm font-semibold">
            Challan date
            <input className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" type="date" name="challan_date" defaultValue={challan.challan_date} />
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Status
            <select className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" name="status" defaultValue={challan.status}>
              {["draft", "ready", "dispatched", "delivered", "cancelled"].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Transporter
            <input className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" name="transporter" defaultValue={challan.transporter ?? ""} />
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Vehicle number
            <input className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" name="vehicle_no" defaultValue={challan.vehicle_no ?? ""} />
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Notes
            <textarea className="mt-1 min-h-24 w-full rounded-md border border-[#cdd6cf] px-3 py-2" name="notes" defaultValue={challan.notes ?? ""} />
          </label>

          <div className="mt-4">
            <p className="text-sm font-semibold">Columns in PDF</p>
            <div className="mt-2 space-y-2">
              {deliveryChallanColumns.map((column) => (
                <label className="flex items-center gap-2 text-sm" key={column.key}>
                  <input type="checkbox" name="columns" value={column.key} defaultChecked={selected.has(column.key)} />
                  {column.label}
                </label>
              ))}
            </div>
          </div>
          <Button className="mt-5 w-full">Save options</Button>
        </form>
      </section>
    </AppShell>
  );
}
