"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "./button";

type LedgerOption = {
  name: string;
  group: string;
};

export function TallyPushButton({ invoiceId, projectName }: { invoiceId: string; projectName?: string }) {
  const [loading, setLoading] = useState(false);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [message, setMessage] = useState("");
  const [debug, setDebug] = useState<{ response?: string; requestXml?: string; counters?: Record<string, number> } | null>(null);
  const [voucherTypeName, setVoucherTypeName] = useState("Sales");
  const [salesLedgerName, setSalesLedgerName] = useState("");
  const [cgstLedgerName, setCgstLedgerName] = useState("Output CGST");
  const [sgstLedgerName, setSgstLedgerName] = useState("Output SGST");
  const [igstLedgerName, setIgstLedgerName] = useState("Output IGST");
  const [roundOffLedgerName, setRoundOffLedgerName] = useState("");
  const [discountLedgerName, setDiscountLedgerName] = useState("");
  const [godownName, setGodownName] = useState("");
  const [isInterstate, setIsInterstate] = useState(false);
  const [accountingMode, setAccountingMode] = useState(false);
  const [narration, setNarration] = useState(projectName ? `Invoice for ${projectName}` : "");
  const [createMissingStockItems, setCreateMissingStockItems] = useState(false);
  const [stockGroupName, setStockGroupName] = useState("Primary");
  const [salesLedgers, setSalesLedgers] = useState<LedgerOption[]>([]);

  const loadSalesLedgers = useCallback(async () => {
    setLoadingLedgers(true);
    try {
      const response = await fetch("/api/tally/ledgers?group=sales");
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load Tally ledgers.");
      const ledgers = (payload.ledgers ?? []) as LedgerOption[];
      setSalesLedgers(ledgers);
      if (ledgers[0]?.name) setSalesLedgerName((current) => current || ledgers[0].name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Tally ledgers.");
    } finally {
      setLoadingLedgers(false);
    }
  }, []);

  useEffect(() => {
    void loadSalesLedgers();
  }, [loadSalesLedgers]);

  async function pushToTally() {
    setLoading(true);
    setMessage("");
    setDebug(null);
    try {
      if (!salesLedgerName.trim()) throw new Error("Select the exact Sales ledger from Tally before pushing.");
      const response = await fetch(`/api/invoices/${invoiceId}/tally/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voucherTypeName,
          salesLedgerName,
          cgstLedgerName,
          sgstLedgerName,
          igstLedgerName,
          roundOffLedgerName,
          discountLedgerName,
          godownName,
          isInterstate,
          accountingMode,
          narration,
          orderReference: projectName,
          createMissingStockItems,
          stockGroupName,
        }),
      });
      const payload = await response.json();
      setDebug({
        response: payload.response,
        requestXml: payload.requestXml,
        counters: payload.tallyResult?.counters,
      });
      if (!response.ok || !payload.ok) {
        const errorText = payload.error || payload.message || payload.response || "Tally push failed.";
        if (String(errorText).includes("Ledger") && String(errorText).includes("does not exist")) {
          throw new Error(`${errorText} Pick the exact ledger from the Sales ledger field and retry.`);
        }
        if (String(errorText).includes("Missing Tally stock item")) {
          throw new Error(`${errorText} This means item names in the invoice must exactly match Tally stock masters.`);
        }
        throw new Error(errorText);
      }
      setMessage("Pushed to Tally.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tally push failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-[#d8dfd7] bg-white p-4">
      <div>
        <h2 className="font-bold">Tally Billing Push</h2>
        <p className="text-sm text-[#5d6b60]">
          Creates an inventory Sales voucher in TallyPrime. Use exact ledger names from Tally.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Voucher type" value={voucherTypeName} onChange={setVoucherTypeName} />
        <label>
          <span className="text-sm font-semibold">Sales ledger</span>
          <input
            className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2"
            value={salesLedgerName}
            onChange={(event) => setSalesLedgerName(event.target.value)}
            list="tally-sales-ledgers"
            placeholder={loadingLedgers ? "Loading from Tally..." : "Select exact Tally sales ledger"}
          />
          <datalist id="tally-sales-ledgers">
            {salesLedgers.map((ledger) => (
              <option key={`${ledger.group}-${ledger.name}`} value={ledger.name}>
                {ledger.group}
              </option>
            ))}
          </datalist>
        </label>
        <Field label="CGST ledger" value={cgstLedgerName} onChange={setCgstLedgerName} disabled={isInterstate} />
        <Field label="SGST ledger" value={sgstLedgerName} onChange={setSgstLedgerName} disabled={isInterstate} />
        <Field label="IGST ledger" value={igstLedgerName} onChange={setIgstLedgerName} disabled={!isInterstate} />
        <Field label="Round off ledger" value={roundOffLedgerName} onChange={setRoundOffLedgerName} placeholder="Optional" />
        <Field label="Discount ledger" value={discountLedgerName} onChange={setDiscountLedgerName} placeholder="If invoice has discount" />
        <Field label="Godown" value={godownName} onChange={setGodownName} placeholder="Optional" disabled={accountingMode} />
        <Field label="Stock group" value={stockGroupName} onChange={setStockGroupName} disabled={!createMissingStockItems || accountingMode} />
        <label className="flex items-end gap-2 pb-2 text-sm font-semibold">
          <input type="checkbox" checked={isInterstate} onChange={(event) => setIsInterstate(event.target.checked)} className="h-4 w-4" />
          Interstate / IGST
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={createMissingStockItems}
            onChange={(event) => setCreateMissingStockItems(event.target.checked)}
            disabled={accountingMode}
            className="h-4 w-4"
          />
          Create missing stock items
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={accountingMode}
            onChange={(event) => setAccountingMode(event.target.checked)}
            className="h-4 w-4"
          />
          Accounting invoice fallback
        </label>
      </div>
      {accountingMode ? (
        <p className="rounded-md border border-[#f0d48a] bg-[#fff8e5] p-3 text-sm text-[#6f4b00]">
          Accounting fallback pushes party, sales, and tax ledgers without stock item movement. Use this to confirm voucher/ledger setup;
          switch it off for inventory stock billing.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={loadSalesLedgers} disabled={loadingLedgers}>
          {loadingLedgers ? "Loading ledgers..." : "Refresh Tally ledgers"}
        </Button>
        {salesLedgers.length ? (
          <p className="text-xs text-[#5d6b60]">Found {salesLedgers.length} possible sales ledger(s) from Tally.</p>
        ) : null}
      </div>
      <label>
        <span className="text-sm font-semibold">Narration</span>
        <input
          className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2"
          value={narration}
          onChange={(event) => setNarration(event.target.value)}
          placeholder="Invoice narration in Tally"
        />
      </label>
      <Button type="button" onClick={pushToTally} disabled={loading}>
        {loading ? "Pushing..." : "Push Sales Voucher to Tally"}
      </Button>
      {message ? <p className="text-sm text-[#5d6b60]">{message}</p> : null}
      {debug ? (
        <details className="rounded-md border border-[#d8dfd7] bg-[#f8faf7] p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Tally debug response</summary>
          {debug.counters ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {Object.entries(debug.counters).map(([key, value]) => (
                <p className="rounded-md bg-white px-2 py-1" key={key}>
                  <span className="font-semibold">{key}:</span> {value}
                </p>
              ))}
            </div>
          ) : null}
          <p className="mt-3 font-semibold">Raw response</p>
          <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-white p-2 text-xs">{debug.response || "-"}</pre>
          <p className="mt-3 font-semibold">Request XML preview</p>
          <pre className="mt-1 max-h-56 overflow-auto rounded-md bg-white p-2 text-xs">{debug.requestXml || "-"}</pre>
        </details>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-semibold">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2 disabled:bg-[#eef3ee] disabled:text-[#7b877f]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  );
}
