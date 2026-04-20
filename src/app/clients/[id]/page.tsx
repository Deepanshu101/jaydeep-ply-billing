import { notFound } from "next/navigation";
import { updateClientMemory } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/button";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: customer }, { data: quotations }, { data: invoices }, { data: communications }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).single(),
    supabase.from("quotations").select("id, quotation_no, project_name, grand_total, status, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("invoices").select("id, invoice_no, project_name, grand_total, paid_amount, due_date, invoice_date").eq("customer_id", id).order("invoice_date", { ascending: false }).limit(20),
    supabase.from("communication_logs").select("id, channel, subject, status, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!customer) notFound();

  const quotedValue = (quotations ?? []).reduce((sum, quote) => sum + Number(quote.grand_total), 0);
  const billedValue = (invoices ?? []).reduce((sum, invoice) => sum + Number(invoice.grand_total), 0);
  const outstanding = (invoices ?? []).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.grand_total) - Number(invoice.paid_amount || 0)), 0);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Client Profile</p>
        <h1 className="mt-1 text-3xl font-bold">{customer.name}</h1>
        <p className="mt-2 text-[#5d6b60]">{customer.phone || customer.email || "Contact pending"}</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric label="Quoted value" value={inr(quotedValue)} />
        <Metric label="Billed value" value={inr(billedValue)} />
        <Metric label="Outstanding" value={inr(outstanding)} danger={outstanding > 0} />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-md border border-[#d8dfd7] bg-white p-4 shadow-sm">
          <h2 className="text-xl font-bold">Memory settings</h2>
          <form action={updateClientMemory} className="mt-4 space-y-3">
            <input type="hidden" name="customer_id" value={customer.id} />
            <Field label="Payment terms days" name="payment_terms_days" type="number" defaultValue={customer.payment_terms_days ?? 30} />
            <Field label="Preferred brands" name="preferred_brands" defaultValue={(customer.preferred_brands ?? []).join(", ")} />
            <Select label="Price sensitivity" name="price_sensitivity" defaultValue={customer.price_sensitivity ?? "unknown"} options={["unknown", "low", "medium", "high"]} />
            <Select label="Risk level" name="risk_level" defaultValue={customer.risk_level ?? "unknown"} options={["unknown", "low", "medium", "high"]} />
            <Button>Save memory</Button>
          </form>
          <div className="mt-5 rounded-md bg-[#eef3ee] p-3 text-sm">
            <p className="font-semibold">Salesperson hints</p>
            <p className="mt-1">Terms: {customer.payment_terms_days ?? 30} days.</p>
            <p>Risk: {customer.risk_level ?? "unknown"}.</p>
            <p>Sensitivity: {customer.price_sensitivity ?? "unknown"}.</p>
          </div>
        </div>

        <div className="space-y-4">
          <Panel title="Recent quotations" rows={(quotations ?? []).map((q) => [q.quotation_no, q.project_name, q.status, inr(Number(q.grand_total))])} />
          <Panel title="Recent invoices" rows={(invoices ?? []).map((i) => [i.invoice_no, i.project_name, i.due_date || "-", inr(Number(i.grand_total) - Number(i.paid_amount || 0))])} />
          <Panel title="Recent communication" rows={(communications ?? []).map((c) => [c.channel, c.subject || "-", c.status, new Date(c.created_at).toLocaleDateString("en-IN")])} />
        </div>
      </section>
    </AppShell>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" {...inputProps} />
    </label>
  );
}

function Select({ label, options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <select className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" {...props}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className={`rounded-md border bg-white p-5 shadow-sm ${danger ? "border-[#f2b8b5]" : "border-[#d8dfd7]"}`}><p className="text-sm font-semibold text-[#5d6b60]">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p></div>;
}

function Panel({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="rounded-md border border-[#d8dfd7] bg-white p-4 shadow-sm">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.map((row, index) => <div className="grid grid-cols-4 gap-2 rounded-md bg-[#f6f7f4] p-2 text-sm" key={index}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>) : <p className="text-sm text-[#5d6b60]">No records yet.</p>}
      </div>
    </div>
  );
}
