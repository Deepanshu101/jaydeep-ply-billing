import { AppShell } from "@/components/app-shell";
import { CommandBox } from "@/components/ai/command-box";
import { ButtonLink } from "@/components/button";
import { safeRows } from "@/lib/dashboard";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type InvoiceRow = {
  id: string;
  invoice_no: string;
  client_name: string;
  grand_total: number;
  invoice_date: string;
  due_date: string | null;
  paid_amount: number | null;
  tally_sync_status: string | null;
};

type QuoteRow = {
  id: string;
  quotation_no: string;
  client_name: string;
  project_name: string;
  grand_total: number;
  status: string;
  created_at: string;
  expected_margin_percent: number | null;
};

type LeadRow = {
  id: string;
  contact_name: string | null;
  project_name: string | null;
  source: string;
  status: string;
  priority: string;
  next_follow_up_at: string | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [quotes, invoices, leads, salesOrders, dispatches, followups, imports] = await Promise.all([
    safeRows<QuoteRow>(
      supabase
        .from("quotations")
        .select("id, quotation_no, client_name, project_name, grand_total, status, created_at, expected_margin_percent")
        .order("created_at", { ascending: false })
        .limit(8),
    ),
    safeRows<InvoiceRow>(
      supabase
        .from("invoices")
        .select("id, invoice_no, client_name, grand_total, invoice_date, due_date, paid_amount, tally_sync_status")
        .order("invoice_date", { ascending: false })
        .limit(20),
    ),
    safeRows<LeadRow>(
      supabase
        .from("leads")
        .select("id, contact_name, project_name, source, status, priority, next_follow_up_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ),
    safeRows<{ id: string; status: string }>(supabase.from("sales_orders").select("id, status").limit(50)),
    safeRows<{ id: string; status: string; dispatch_date: string | null }>(
      supabase.from("dispatches").select("id, status, dispatch_date").limit(50),
    ),
    safeRows<{ id: string; status: string; risk_score: number; due_date: string | null }>(
      supabase.from("payment_followups").select("id, status, risk_score, due_date").limit(50),
    ),
    safeRows<{ id: string; status: string; created_at: string }>(
      supabase.from("import_batches").select("id, status, created_at").order("created_at", { ascending: false }).limit(20),
    ),
  ]);

  const monthlySales = invoices
    .filter((invoice) => invoice.invoice_date >= monthStart)
    .reduce((sum, invoice) => sum + Number(invoice.grand_total), 0);
  const overdueInvoices = invoices.filter((invoice) => invoice.due_date && invoice.due_date < today && Number(invoice.paid_amount || 0) < Number(invoice.grand_total));
  const blockedCapital = overdueInvoices.reduce(
    (sum, invoice) => sum + Math.max(0, Number(invoice.grand_total) - Number(invoice.paid_amount || 0)),
    0,
  );
  const pendingTally = invoices.filter((invoice) => invoice.tally_sync_status !== "synced").length;
  const pendingQuotes = quotes.filter((quote) => quote.status === "draft" || quote.status === "pending_approval").length;
  const wonOrders = salesOrders.filter((order) => order.status === "received" || order.status === "confirmed").length;
  const dispatchDue = dispatches.filter((dispatch) => dispatch.status === "pending" || dispatch.status === "ready").length;
  const marginAlerts = quotes.filter((quote) => Number(quote.expected_margin_percent ?? 100) < 12).length;
  const followupPriority = followups.filter((followup) => followup.status !== "paid" && followup.status !== "promised").length;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Command Center</p>
          <h1 className="mt-1 text-3xl font-bold">Jaydeep Ply Sales OS</h1>
          <p className="text-[#5d6b60]">BOQ, quotation, negotiation, dispatch, Tally, and payment signals in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/import">Import BOQ</ButtonLink>
          <ButtonLink variant="secondary" href="/quotations/new">
            New quotation
          </ButtonLink>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Pending quotations" value={pendingQuotes} note="Drafts and approvals" />
        <Metric label="Monthly sales" value={inr(monthlySales)} note="Invoice value this month" />
        <Metric label="Tally sync pending" value={pendingTally} note="Invoices not synced" />
        <Metric label="Blocked capital" value={inr(blockedCapital)} note="Overdue outstanding" tone={blockedCapital ? "danger" : "normal"} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Signal title="New BOQs" value={imports.filter((item) => item.status === "review" || item.status === "pending").length} action="Open Import Desk" href="/import" />
        <Signal title="POs received" value={wonOrders} action="Review orders" href="/quotations" />
        <Signal title="Dispatch due" value={dispatchDue} action="Check invoices" href="/invoices" />
        <Signal title="Payment follow-ups" value={followupPriority} action="Prioritize recovery" href="/invoices" />
        <Signal title="Margin leakage alerts" value={marginAlerts} action="Review quotes" href="/quotations" tone="danger" />
        <Signal title="Negotiation queue" value={quotes.filter((quote) => quote.status === "approved").length} action="Send / revise" href="/quotations" />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Active quotation pipeline">
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-[#eef3ee] text-left">
                <tr>
                  {["No.", "Client", "Project", "Status", "Value"].map((heading) => (
                    <th className="px-3 py-3 font-semibold" key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr className="border-t border-[#edf0ed]" key={quote.id}>
                    <td className="px-3 py-3 font-semibold">{quote.quotation_no}</td>
                    <td className="px-3 py-3">{quote.client_name}</td>
                    <td className="px-3 py-3">{quote.project_name}</td>
                    <td className="px-3 py-3">{quote.status.replace("_", " ")}</td>
                    <td className="px-3 py-3">{inr(Number(quote.grand_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="AI command box">
          <CommandBox />
          <div className="mt-4 grid gap-2 text-sm">
            {[
              "Prepare revised quotation for selected client",
              "Draft payment reminder for overdue 75 days",
              "Find quotes with low margin",
              "Compare BOQ with previous order",
            ].map((item) => (
              <div className="rounded-md border border-[#edf0ed] px-3 py-2" key={item}>
                {item}
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {leads.length ? (
        <section className="mt-6">
          <Panel title="Lead memory">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {leads.map((lead) => (
                <div className="rounded-md border border-[#edf0ed] p-3" key={lead.id}>
                  <p className="font-semibold">{lead.contact_name || "New lead"}</p>
                  <p className="text-sm text-[#5d6b60]">{lead.project_name || "Project pending"}</p>
                  <p className="mt-2 text-xs font-semibold uppercase text-[#1f6f50]">{lead.source} / {lead.priority}</p>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      ) : null}
    </AppShell>
  );
}

function Metric({ label, value, note, tone = "normal" }: { label: string; value: string | number; note: string; tone?: "normal" | "danger" }) {
  return (
    <div className={`rounded-md border bg-white p-5 shadow-sm ${tone === "danger" ? "border-[#f2b8b5]" : "border-[#d8dfd7]"}`}>
      <p className="text-sm font-semibold text-[#5d6b60]">{label}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-xs text-[#5d6b60]">{note}</p>
    </div>
  );
}

function Signal({ title, value, action, href, tone = "normal" }: { title: string; value: number; action: string; href: string; tone?: "normal" | "danger" }) {
  return (
    <div className={`rounded-md border bg-white p-4 shadow-sm ${tone === "danger" && value ? "border-[#f2b8b5]" : "border-[#d8dfd7]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{title}</p>
          <p className="mt-1 text-sm text-[#5d6b60]">{action}</p>
        </div>
        <span className="rounded-md bg-[#eef3ee] px-3 py-1 text-lg font-bold">{value}</span>
      </div>
      <ButtonLink className="mt-4 w-full" variant="secondary" href={href}>
        Open
      </ButtonLink>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-[#d8dfd7] bg-white shadow-sm">
      <div className="border-b border-[#d8dfd7] p-4">
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
