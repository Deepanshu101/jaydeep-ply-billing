import { updateSalesOrder } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/button";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type OrderRow = {
  id: string;
  po_number: string | null;
  po_date: string | null;
  status: string;
  grand_total: number;
  customers?: { name: string } | { name: string }[] | null;
  quotations?: { quotation_no: string } | { quotation_no: string }[] | null;
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_orders")
    .select("id, po_number, po_date, status, grand_total, customers(name), quotations(quotation_no)")
    .order("created_at", { ascending: false })
    .limit(100);
  const orders = (data ?? []) as OrderRow[];

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">PO to Billing</p>
        <h1 className="mt-1 text-3xl font-bold">Sales orders</h1>
        <p className="mt-2 text-[#5d6b60]">Track PO received, confirmation, dispatch readiness, and handoff to invoice/Tally.</p>
      </div>
      <div className="overflow-hidden rounded-md border border-[#d8dfd7] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-[#eef3ee] text-left">
              <tr>{["Client", "Quotation", "PO No.", "PO Date", "Status", "Value", "Update"].map((h) => <th className="px-3 py-3 font-semibold" key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr className="border-t border-[#edf0ed]" key={order.id}>
                  <td className="px-3 py-3 font-semibold">{relName(order.customers, "name")}</td>
                  <td className="px-3 py-3">{relName(order.quotations, "quotation_no")}</td>
                  <td className="px-3 py-3">{order.po_number || "-"}</td>
                  <td className="px-3 py-3">{order.po_date || "-"}</td>
                  <td className="px-3 py-3">{order.status}</td>
                  <td className="px-3 py-3">{inr(Number(order.grand_total))}</td>
                  <td className="px-3 py-3">
                    <form action={updateSalesOrder} className="flex flex-wrap gap-2">
                      <input type="hidden" name="order_id" value={order.id} />
                      <input className="w-28 rounded-md border border-[#cdd6cf] px-2 py-1" name="po_number" placeholder="PO no." defaultValue={order.po_number ?? ""} />
                      <input className="w-36 rounded-md border border-[#cdd6cf] px-2 py-1" name="po_date" type="date" defaultValue={order.po_date ?? ""} />
                      <select className="rounded-md border border-[#cdd6cf] px-2 py-1" name="status" defaultValue={order.status}>
                        {["received", "confirmed", "part_dispatched", "completed", "cancelled"].map((status) => <option key={status}>{status}</option>)}
                      </select>
                      <Button variant="secondary">Save</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!orders.length ? <p className="p-4 text-sm text-[#5d6b60]">No sales orders yet. Convert an approved quotation to begin.</p> : null}
      </div>
    </AppShell>
  );
}

function relName<T extends Record<string, string>>(value: T | T[] | null | undefined, key: keyof T) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.[key] || "-";
}
