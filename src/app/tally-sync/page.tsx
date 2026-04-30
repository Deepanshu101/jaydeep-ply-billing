import { AppShell } from "@/components/app-shell";
import { TallySyncForm } from "@/components/tally/tally-sync-form";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type SyncRun = {
  id: string;
  sync_type: string;
  from_date: string;
  to_date: string;
  status: string;
  clients_imported: number;
  products_imported: number;
  rates_imported: number;
  error: string | null;
  raw_summary: {
    currentStep?: string;
    warnings?: string[];
    debug?: {
      requestName: string;
      ok: boolean;
      severity?: "ok" | "warning" | "error";
      requestXml: string;
      rawResponsePreview: string;
      parsedRowCount: number;
      expectedNode: string;
      foundNodeNames: string[];
      responseDateRange?: {
        first: string | null;
        last: string | null;
        uniqueDates: number;
      };
      error?: string;
    }[];
  } | null;
  created_at: string;
};

type RateRow = {
  id: string;
  voucher_no: string | null;
  voucher_date: string | null;
  party_name: string | null;
  item_name: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
};

export default async function TallySyncPage() {
  const supabase = await createClient();
  const defaultFrom = process.env.TALLY_SYNC_FROM || "2025-04-01";
  const defaultTo = process.env.TALLY_SYNC_TO || "2027-03-31";
  const [{ data: runs }, { data: rates }, customersCount, productsCount, rateCount] = await Promise.all([
    supabase.from("tally_sync_runs").select("*").order("created_at", { ascending: false }).limit(10),
    supabase
      .from("product_rate_history")
      .select("id, voucher_no, voucher_date, party_name, item_name, qty, unit, rate, amount")
      .order("voucher_date", { ascending: false })
      .limit(50),
    countRows(supabase, "customers"),
    countRows(supabase, "products"),
    countRows(supabase, "product_rate_history"),
  ]);
  const latestRun = ((runs ?? []) as SyncRun[])[0] ?? null;

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">TallyPrime Sync</p>
        <h1 className="mt-1 text-3xl font-bold">Import clients and selling rates</h1>
        <p className="mt-2 max-w-3xl text-[#5d6b60]">
          Sync Sundry Debtor ledgers, stock items, and sales voucher rates from TallyPrime for FY 2025-26 to FY 2026-27.
        </p>
      </div>

      <TallySyncForm defaultFrom={defaultFrom} defaultTo={defaultTo} />

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Clients in database" value={String(customersCount)} />
        <MetricCard label="Products in database" value={String(productsCount)} />
        <MetricCard label="Rate history rows" value={String(rateCount)} />
        <MetricCard
          label="Latest sync"
          value={latestRun ? syncTypeLabel(latestRun.sync_type) : "No sync yet"}
          note={latestRun ? `${latestRun.status} • ${new Date(latestRun.created_at).toLocaleString("en-IN")}` : "Run Sync all to start"}
          strong={latestRun?.status === "completed"}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-[#d8dfd7] bg-white p-4 text-sm shadow-sm">
          <h2 className="text-xl font-bold">What works without TDL</h2>
          <p className="mt-2 text-[#5d6b60]">
            Client ledger sync and product/item master sync use standard Tally reports. They do not need any custom TDL file.
          </p>
        </div>
        <div className="rounded-md border border-[#f0d48a] bg-[#fff8e5] p-4 text-sm shadow-sm">
          <h2 className="text-xl font-bold">Sales rates need TDL</h2>
          <p className="mt-2 text-[#6f4b00]">
            Selling-rate history requires the custom Tally report <span className="font-semibold">JP_SALES_EXPORT_REPORT</span>.
            That report must output VoucherDate, VoucherNumber, PartyName, StockItemName, Quantity, Unit, Rate, and Amount.
          </p>
        </div>
      </section>

      {latestRun ? (
        <section className="mt-6 rounded-md border border-[#d8dfd7] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Latest run summary</h2>
              <p className="mt-1 text-sm text-[#5d6b60]">
                {syncTypeLabel(latestRun.sync_type)} • {latestRun.from_date} to {latestRun.to_date}
              </p>
            </div>
            <span className={runBadgeClass(latestRun.status)}>{latestRun.status}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <StatusCard label="Clients" value={String(latestRun.clients_imported)} />
            <StatusCard label="Products" value={String(latestRun.products_imported)} />
            <StatusCard label="Rates" value={String(latestRun.rates_imported)} />
          </div>
          {latestRun.raw_summary?.currentStep ? (
            <p className="mt-3 rounded-md bg-[#f6f7f4] px-3 py-2 text-sm">
              <span className="font-semibold">Current step:</span> {latestRun.raw_summary.currentStep}
            </p>
          ) : null}
          {latestRun.raw_summary?.warnings?.length ? (
            <div className="mt-3 rounded-md border border-[#f0d48a] bg-[#fff8e5] p-3 text-sm text-[#8a5b00]">
              {latestRun.raw_summary.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          {latestRun.error ? <p className="mt-3 text-sm text-[#b42318]">{latestRun.error}</p> : null}
        </section>
      ) : null}

      <section className="mt-6 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-md border border-[#d8dfd7] bg-white p-4 shadow-sm">
          <h2 className="text-xl font-bold">Recent sync runs</h2>
          <div className="mt-4 space-y-3">
            {((runs ?? []) as SyncRun[]).map((run) => (
              <div className="rounded-md bg-[#f6f7f4] p-3 text-sm" key={run.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{run.status}</p>
                  <p className="text-[#5d6b60]">{new Date(run.created_at).toLocaleString("en-IN")}</p>
                </div>
                <p className="mt-1 font-semibold text-[#1f6f50]">{syncTypeLabel(run.sync_type)}</p>
                <p className="mt-1 text-[#5d6b60]">{run.from_date} to {run.to_date}</p>
                <p className="mt-2">Clients {run.clients_imported} / Products {run.products_imported} / Rates {run.rates_imported}</p>
                {run.raw_summary?.currentStep ? (
                  <p className="mt-2 font-semibold text-[#8a5b00]">Current step: {run.raw_summary.currentStep}</p>
                ) : null}
                {run.status === "running" ? (
                  <p className="mt-2 text-[#8a5b00]">
                    Sync is active. Refresh this page after a few seconds to see the latest saved phase and debug output.
                  </p>
                ) : null}
                {run.error ? <p className="mt-2 text-[#b42318]">{run.error}</p> : null}
                {run.raw_summary?.warnings?.length ? (
                  <div className="mt-2 rounded-md border border-[#f0d48a] bg-[#fff8e5] p-2 text-[#8a5b00]">
                    {run.raw_summary.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}
                {run.raw_summary?.debug?.length ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer font-semibold">Debug details</summary>
                    <div className="mt-2 space-y-2">
                      {run.raw_summary.debug.map((entry) => (
                        <div className="rounded-md border border-[#d8dfd7] bg-white p-2" key={entry.requestName}>
                          <p className="font-semibold">{entry.requestName}</p>
                          <p>
                            HTTP/report: {debugLabel(entry.severity, entry.ok)} / rows {entry.parsedRowCount}
                          </p>
                          <p>Expected: {entry.expectedNode}</p>
                          {entry.responseDateRange?.uniqueDates ? (
                            <p>
                              Dates found: {entry.responseDateRange.first} to {entry.responseDateRange.last} (
                              {entry.responseDateRange.uniqueDates} day(s))
                            </p>
                          ) : null}
                          {entry.error ? <p className="text-[#b42318]">{entry.error}</p> : null}
                          <p className="mt-1 text-[#5d6b60]">Found nodes: {entry.foundNodeNames.slice(0, 30).join(", ") || "-"}</p>
                          <details className="mt-2">
                            <summary className="cursor-pointer">Request XML</summary>
                            <pre className="mt-1 max-h-44 overflow-auto rounded-md bg-[#f6f7f4] p-2 text-xs">{entry.requestXml}</pre>
                          </details>
                          <details className="mt-2">
                            <summary className="cursor-pointer">Raw response preview</summary>
                            <pre className="mt-1 max-h-44 overflow-auto rounded-md bg-[#f6f7f4] p-2 text-xs">{entry.rawResponsePreview || "No response captured"}</pre>
                          </details>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
            {!(runs ?? []).length ? <p className="text-sm text-[#5d6b60]">No sync runs yet.</p> : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-[#d8dfd7] bg-white shadow-sm">
          <div className="border-b border-[#d8dfd7] p-4">
            <h2 className="text-xl font-bold">Imported selling-rate history</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-sm">
              <thead className="bg-[#eef3ee] text-left">
                <tr>{["Date", "Client", "Item", "Qty", "Rate", "Amount", "Voucher"].map((heading) => <th className="px-3 py-3 font-semibold" key={heading}>{heading}</th>)}</tr>
              </thead>
              <tbody>
                {((rates ?? []) as RateRow[]).map((row) => (
                  <tr className="border-t border-[#edf0ed]" key={row.id}>
                    <td className="px-3 py-3">{row.voucher_date || "-"}</td>
                    <td className="px-3 py-3">{row.party_name || "-"}</td>
                    <td className="px-3 py-3 font-semibold">{row.item_name}</td>
                    <td className="px-3 py-3">{row.qty ?? "-"} {row.unit ?? ""}</td>
                    <td className="px-3 py-3">{row.rate ? inr(Number(row.rate)) : "-"}</td>
                    <td className="px-3 py-3">{row.amount ? inr(Number(row.amount)) : "-"}</td>
                    <td className="px-3 py-3">{row.voucher_no || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!(rates ?? []).length ? <p className="p-4 text-sm text-[#5d6b60]">No selling-rate history imported yet.</p> : null}
        </div>
      </section>

      <section className="mt-6 rounded-md border border-[#d8dfd7] bg-white p-4 text-sm shadow-sm">
        <h2 className="text-xl font-bold">Before syncing</h2>
        <p className="mt-2 text-[#5d6b60]">
          TallyPrime must be open, the target company must be loaded, and Tally HTTP must be reachable at `TALLY_HTTP_URL`.
          If this app is running in the cloud, it cannot reach your office machine&apos;s localhost without a connector or tunnel.
        </p>
      </section>
    </AppShell>
  );
}

async function countRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "customers" | "products" | "product_rate_history",
) {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

function debugLabel(severity: "ok" | "warning" | "error" | undefined, ok: boolean) {
  if (severity === "warning") return "Warning";
  if (severity === "error") return "Failed";
  return ok ? "OK" : "Failed";
}

function syncTypeLabel(syncType: string) {
  if (syncType === "sales_rate_history") return "Sales Rate History";
  if (syncType === "client_product_masters") return "Client/Product Masters";
  return syncType || "Tally Sync";
}

function MetricCard({
  label,
  value,
  note,
  strong,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className={`rounded-md border px-4 py-3 shadow-sm ${strong ? "border-[#1f6f50] bg-[#1f6f50] text-white" : "border-[#d8dfd7] bg-white text-[#1d2520]"}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${strong ? "text-white/85" : "text-[#5d6b60]"}`}>{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {note ? <p className={`mt-2 text-sm ${strong ? "text-white/85" : "text-[#5d6b60]"}`}>{note}</p> : null}
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#f6f7f4] px-3 py-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5d6b60]">{label}</p>
      <p className="mt-2 text-xl font-bold text-[#1d2520]">{value}</p>
    </div>
  );
}

function runBadgeClass(status: string) {
  if (status === "completed") return "rounded-md bg-[#eef8f1] px-3 py-1 text-sm font-semibold text-[#17613d]";
  if (status === "failed") return "rounded-md bg-[#fdeceb] px-3 py-1 text-sm font-semibold text-[#b42318]";
  return "rounded-md bg-[#fff8e5] px-3 py-1 text-sm font-semibold text-[#8a5b00]";
}
