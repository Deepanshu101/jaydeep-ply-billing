"use client";

import { useState } from "react";
import { Button } from "@/components/button";

export function TallySyncForm({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [loadingMode, setLoadingMode] = useState<"masters" | "rates" | "full" | null>(null);
  const [message, setMessage] = useState("");
  const [debug, setDebug] = useState<
    {
      requestName: string;
      ok: boolean;
      severity?: "ok" | "warning" | "error";
      parsedRowCount: number;
      rawResponsePreview: string;
      responseDateRange?: { first: string | null; last: string | null; uniqueDates: number };
      error?: string;
    }[]
  >([]);

  async function runSync(syncMode: "masters" | "rates") {
    setDebug([]);
    const response = await fetch("/api/tally/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from_date: fromDate, to_date: toDate, sync_mode: syncMode }),
    });
    const payload = await response.json();
    setDebug(payload.summary?.debug ?? []);
    if (!response.ok) throw new Error(payload.error || "Tally sync failed.");
    return payload;
  }

  async function sync(syncMode: "masters" | "rates" | "full") {
    setLoadingMode(syncMode);
    setMessage(
      syncMode === "rates"
        ? "Contacting TallyPrime for JP_SALES_EXPORT_REPORT. This requires the custom TDL report to be installed in Tally."
        : syncMode === "full"
          ? "Running full Tally sync: first client/product masters, then sales rate history."
          : "Contacting TallyPrime for client and product masters. This does not require custom TDL.",
    );
    setDebug([]);
    try {
      if (syncMode === "full") {
        const mastersPayload = await runSync("masters");
        const mastersWarnings = mastersPayload.summary.warnings?.length ? ` Warning: ${mastersPayload.summary.warnings.join(" ")}` : "";
        setMessage(`Masters synced. Imported ${mastersPayload.summary.clients} clients and ${mastersPayload.summary.products} products.${mastersWarnings} Starting sales rate history...`);
        const ratesPayload = await runSync("rates");
        const rateWarnings = ratesPayload.summary.warnings?.length ? ` Warning: ${ratesPayload.summary.warnings.join(" ")}` : "";
        setMessage(
          `Full sync completed. Clients ${mastersPayload.summary.clients}, Products ${mastersPayload.summary.products}, Rates ${ratesPayload.summary.rates}.${rateWarnings}`,
        );
      } else {
        const payload = await runSync(syncMode);
        const warnings = payload.summary.warnings?.length ? ` Warning: ${payload.summary.warnings.join(" ")}` : "";
        setMessage(
          syncMode === "rates"
            ? `Imported ${payload.summary.rates} selling-rate rows.${warnings}`
            : `Imported ${payload.summary.clients} clients and ${payload.summary.products} products.${warnings}`,
        );
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tally sync failed.");
    } finally {
      setLoadingMode(null);
    }
  }

  return (
    <div className="rounded-md border border-[#d8dfd7] bg-white p-4 shadow-sm">
      <h2 className="text-xl font-bold">Sync from TallyPrime</h2>
      <p className="mt-2 text-sm text-[#5d6b60]">
        Pull client ledgers, stock items, and sales voucher rates for FY 2025-26 through FY 2026-27.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label>
          <span className="text-sm font-semibold">From</span>
          <input className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label>
          <span className="text-sm font-semibold">To</span>
          <input className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <div className="flex flex-col justify-end gap-2 sm:flex-row">
          <Button type="button" onClick={() => sync("full")} disabled={Boolean(loadingMode)}>
            {loadingMode === "full" ? "Syncing all..." : "Sync all"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => sync("masters")} disabled={Boolean(loadingMode)}>
            {loadingMode === "masters" ? "Syncing..." : "Sync clients/products"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => sync("rates")} disabled={Boolean(loadingMode)}>
            {loadingMode === "rates" ? "Syncing..." : "Sync sales rates"}
          </Button>
        </div>
      </div>
      {message ? <p className="mt-4 rounded-md bg-[#eef3ee] p-3 text-sm font-semibold text-[#34513d]">{message}</p> : null}
      {loadingMode ? (
        <p className="mt-3 text-sm text-[#5d6b60]">
          Fetching reports now. If Tally does not answer, this request will fail automatically after the configured timeout instead of staying stuck.
        </p>
      ) : null}
      {debug.length ? (
        <div className="mt-4 space-y-3">
          <h3 className="font-bold">Live debug</h3>
          {debug.map((entry) => (
            <div className="rounded-md border border-[#d8dfd7] p-3 text-sm" key={entry.requestName}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{entry.requestName}</p>
                <span className={debugClass(entry.severity, entry.ok)}>
                  {debugLabel(entry.severity, entry.ok)} / rows {entry.parsedRowCount}
                </span>
              </div>
              {entry.error ? <p className="mt-2 text-[#b42318]">{entry.error}</p> : null}
              {entry.responseDateRange?.uniqueDates ? (
                <p className="mt-2 text-[#5d6b60]">
                  Dates found: {entry.responseDateRange.first} to {entry.responseDateRange.last} (
                  {entry.responseDateRange.uniqueDates} day(s))
                </p>
              ) : null}
              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-[#f6f7f4] p-2 text-xs">{entry.rawResponsePreview || "No response captured"}</pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function debugLabel(severity: "ok" | "warning" | "error" | undefined, ok: boolean) {
  if (severity === "warning") return "Warning";
  if (severity === "error") return "Failed";
  return ok ? "OK" : "Failed";
}

function debugClass(severity: "ok" | "warning" | "error" | undefined, ok: boolean) {
  if (severity === "warning") return "text-[#8a5b00]";
  if (severity === "error") return "text-[#b42318]";
  return ok ? "text-[#17613d]" : "text-[#b42318]";
}
