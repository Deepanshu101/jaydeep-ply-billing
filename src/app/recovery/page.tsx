import { createPaymentFollowup, recordPayment } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/button";
import { communicationTemplates } from "@/lib/share-templates";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type InvoiceRow = {
  id: string;
  invoice_no: string;
  customer_id: string;
  client_name: string;
  grand_total: number;
  paid_amount: number | null;
  due_date: string | null;
  invoice_date: string;
};

export default async function RecoveryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_no, customer_id, client_name, grand_total, paid_amount, due_date, invoice_date")
    .order("invoice_date", { ascending: false })
    .limit(200);
  const invoices = ((data ?? []) as InvoiceRow[]).filter((invoice) => outstanding(invoice) > 0);
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d180: 0 };
  invoices.forEach((invoice) => {
    const days = overdueDays(invoice);
    const value = outstanding(invoice);
    if (days <= 0) buckets.current += value;
    else if (days <= 30) buckets.d30 += value;
    else if (days <= 60) buckets.d60 += value;
    else if (days <= 90) buckets.d90 += value;
    else buckets.d180 += value;
  });

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Recovery Intelligence</p>
        <h1 className="mt-1 text-3xl font-bold">Outstanding recovery machine</h1>
        <p className="mt-2 text-[#5d6b60]">Track blocked capital, overdue buckets, promises, and reminder actions.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Current" value={inr(buckets.current)} />
        <Metric label="1-30 days" value={inr(buckets.d30)} />
        <Metric label="31-60 days" value={inr(buckets.d60)} />
        <Metric label="61-90 days" value={inr(buckets.d90)} danger={buckets.d90 > 0} />
        <Metric label="90+ days" value={inr(buckets.d180)} danger={buckets.d180 > 0} />
      </section>

      <section className="mt-6 overflow-hidden rounded-md border border-[#d8dfd7] bg-white shadow-sm">
        <div className="border-b border-[#d8dfd7] p-4">
          <h2 className="text-xl font-bold">Outstanding invoices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-sm">
            <thead className="bg-[#eef3ee] text-left">
              <tr>{["Invoice", "Client", "Due", "Days", "Outstanding", "Record payment", "Follow-up"].map((h) => <th className="px-3 py-3 font-semibold" key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr className="border-t border-[#edf0ed]" key={invoice.id}>
                  <td className="px-3 py-3 font-semibold">{invoice.invoice_no}</td>
                  <td className="px-3 py-3">{invoice.client_name}</td>
                  <td className="px-3 py-3">{invoice.due_date || "Not set"}</td>
                  <td className="px-3 py-3">{overdueDays(invoice)}</td>
                  <td className="px-3 py-3 font-bold">{inr(outstanding(invoice))}</td>
                  <td className="px-3 py-3">
                    <form action={recordPayment} className="flex flex-wrap gap-2">
                      <input type="hidden" name="invoice_id" value={invoice.id} />
                      <input type="hidden" name="customer_id" value={invoice.customer_id} />
                      <input className="w-28 rounded-md border border-[#cdd6cf] px-2 py-1" name="amount" type="number" step="0.01" placeholder="Amount" />
                      <input className="w-36 rounded-md border border-[#cdd6cf] px-2 py-1" name="payment_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                      <Button variant="secondary">Save</Button>
                    </form>
                  </td>
                  <td className="px-3 py-3">
                    <form action={createPaymentFollowup} className="flex flex-wrap gap-2">
                      <input type="hidden" name="invoice_id" value={invoice.id} />
                      <input type="hidden" name="customer_id" value={invoice.customer_id} />
                      <input type="hidden" name="due_date" value={invoice.due_date ?? ""} />
                      <input className="w-36 rounded-md border border-[#cdd6cf] px-2 py-1" name="promised_date" type="date" />
                      <input className="w-20 rounded-md border border-[#cdd6cf] px-2 py-1" name="risk_score" type="number" min="0" max="100" defaultValue={Math.min(100, Math.max(0, overdueDays(invoice)))} />
                      <Button variant="secondary">Track</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!invoices.length ? <p className="p-4 text-sm text-[#5d6b60]">No outstanding invoices found.</p> : null}
      </section>

      <section className="mt-6 rounded-md border border-[#d8dfd7] bg-white p-4 shadow-sm">
        <h2 className="text-xl font-bold">Reminder drafts</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Draft title="Gentle reminder" body={communicationTemplates.paymentReminder} />
          <Draft title="Stern reminder" body={communicationTemplates.sternPaymentReminder} />
        </div>
      </section>
    </AppShell>
  );
}

function outstanding(invoice: InvoiceRow) {
  return Math.max(0, Number(invoice.grand_total) - Number(invoice.paid_amount || 0));
}

function overdueDays(invoice: InvoiceRow) {
  const due = invoice.due_date ? new Date(invoice.due_date) : new Date(invoice.invoice_date);
  return Math.floor((Date.now() - due.getTime()) / 86400000);
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className={`rounded-md border bg-white p-5 shadow-sm ${danger ? "border-[#f2b8b5]" : "border-[#d8dfd7]"}`}><p className="text-sm font-semibold text-[#5d6b60]">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p></div>;
}

function Draft({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-[#edf0ed] p-3">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 whitespace-pre-line text-sm text-[#5d6b60]">{body}</p>
    </div>
  );
}
