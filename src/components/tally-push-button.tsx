"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./button";

type LedgerOption = {
  name: string;
  group: string;
};

type VoucherTypeOption = {
  name: string;
  parent: string;
  affectsStock: boolean;
  isActive: boolean;
};

type GodownOption = {
  name: string;
  parent?: string;
};

type Readiness = {
  ok: boolean;
  mode: "accounting" | "inventory";
  missingPartyLedger: boolean;
  missingLedgers: string[];
  missingStockItems: string[];
  voucherTypeIssue?: string;
  godownIssue?: string;
  checked?: {
    gstThroughSalesLedger?: boolean;
    resolvedGodownName?: string;
    availableGodowns?: string[];
    stockEnabledVoucherTypes?: string[];
  };
};

type AttemptedVariant = {
  name: string;
  ok: boolean;
  message: string;
  counters?: Record<string, number>;
};

export function TallyPushButton({ invoiceId, projectName }: { invoiceId: string; projectName?: string }) {
  const [loading, setLoading] = useState(false);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [message, setMessage] = useState("");
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [debug, setDebug] = useState<{
    response?: string;
    requestXml?: string;
    counters?: Record<string, number>;
    attemptedVariants?: AttemptedVariant[];
    successfulVariant?: string;
  } | null>(null);
  const [salesLedgerName, setSalesLedgerName] = useState("");
  const [cgstLedgerName, setCgstLedgerName] = useState("Output CGST");
  const [sgstLedgerName, setSgstLedgerName] = useState("Output SGST");
  const [igstLedgerName, setIgstLedgerName] = useState("Output IGST");
  const [discountLedgerName, setDiscountLedgerName] = useState("");
  const [voucherTypeName, setVoucherTypeName] = useState("Sales GST");
  const [voucherSuffix, setVoucherSuffix] = useState("-STK");
  const [godownName, setGodownName] = useState("");
  const [inventoryMode, setInventoryMode] = useState(true);
  const [isInterstate, setIsInterstate] = useState(false);
  const [gstThroughSalesLedger, setGstThroughSalesLedger] = useState(true);
  const [createMissingPartyLedger, setCreateMissingPartyLedger] = useState(true);
  const [createMissingStockItems, setCreateMissingStockItems] = useState(true);
  const [salesLedgers, setSalesLedgers] = useState<LedgerOption[]>([]);
  const [taxLedgers, setTaxLedgers] = useState<LedgerOption[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<VoucherTypeOption[]>([]);
  const [godowns, setGodowns] = useState<GodownOption[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const options = useMemo(
    () => ({
      voucherTypeName,
      salesLedgerName,
      gstThroughSalesLedger,
      cgstLedgerName,
      sgstLedgerName,
      igstLedgerName,
      discountLedgerName,
      godownName,
      isInterstate,
      accountingMode: !inventoryMode,
      createMissingPartyLedger,
      createMissingStockItems,
      stockGroupName: "",
      narration: projectName ? `Invoice for ${projectName}` : "Invoice from Jaydeep Ply Billing",
      voucherNumberSuffix: "",
      voucherAction: "Create",
    }),
    [
      voucherTypeName,
      salesLedgerName,
      gstThroughSalesLedger,
      cgstLedgerName,
      sgstLedgerName,
      igstLedgerName,
      discountLedgerName,
      godownName,
      isInterstate,
      inventoryMode,
      createMissingPartyLedger,
      createMissingStockItems,
      projectName,
    ],
  );

  const loadSalesLedgers = useCallback(async () => {
    setLoadingLedgers(true);
    try {
      const response = await fetch("/api/tally/ledgers?group=sales");
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load Tally ledgers.");
      const ledgers = (payload.ledgers ?? []) as LedgerOption[];
      setSalesLedgers(ledgers);
      const preferred =
        ledgers.find((ledger) => /gst/i.test(ledger.name))?.name ??
        ledgers.find((ledger) => /sales/i.test(ledger.name))?.name ??
        ledgers[0]?.name;
      if (preferred) setSalesLedgerName((current) => current || preferred);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Tally ledgers.");
    } finally {
      setLoadingLedgers(false);
    }
  }, []);

  const loadTaxLedgers = useCallback(async () => {
    try {
      const response = await fetch("/api/tally/ledgers?group=tax");
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load GST ledgers.");
      const ledgers = (payload.ledgers ?? []) as LedgerOption[];
      setTaxLedgers(ledgers);
      setCgstLedgerName((current) => current || bestLedger(ledgers, "cgst"));
      setSgstLedgerName((current) => current || bestLedger(ledgers, "sgst"));
      setIgstLedgerName((current) => current || bestLedger(ledgers, "igst"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load GST ledgers.");
    }
  }, []);

  const loadVoucherTypes = useCallback(async () => {
    try {
      const response = await fetch("/api/tally/masters?type=voucher-types");
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load Tally voucher types.");
      const options = (payload.voucherTypes ?? []) as VoucherTypeOption[];
      setVoucherTypes(options);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Tally voucher types.");
    }
  }, []);

  const loadGodowns = useCallback(async () => {
    try {
      const response = await fetch("/api/tally/masters?type=godowns");
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load Tally godowns.");
      const options = (payload.godowns ?? []) as GodownOption[];
      setGodowns(options);
      if (options.length === 1) setGodownName((current) => current || options[0].name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Tally godowns.");
    }
  }, []);

  useEffect(() => {
    void loadSalesLedgers();
    void loadTaxLedgers();
    void loadVoucherTypes();
    void loadGodowns();
  }, [loadSalesLedgers, loadTaxLedgers, loadVoucherTypes, loadGodowns]);

  useEffect(() => {
    if (!salesLedgerName.trim() || loadingLedgers) return;
    void checkReadiness(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesLedgerName, loadingLedgers]);

  useEffect(() => {
    if (!salesLedgerName.trim()) return;
    if (/gst/i.test(salesLedgerName)) setGstThroughSalesLedger(true);
  }, [salesLedgerName]);

  async function checkReadiness(silent = false) {
    if (!silent) {
      setLoading(true);
      setMessage("");
      setDebug(null);
    }
    try {
      if (!salesLedgerName.trim()) throw new Error("Select the exact Sales ledger from Tally.");
      const payload = await callTally({ ...options, preflightOnly: true });
      setReadiness(payload.readiness ?? null);
      if (!silent) setMessage(payload.message || (payload.ok ? "Ready for Tally push." : "Some Tally masters are missing."));
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : "Could not check Tally readiness.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function pushToTally(mode: "inventory" | "accounting" | "stock-test" | "stock-alter" = "inventory") {
    setLoading(true);
    setMessage("");
    setDebug(null);
    try {
      if (!salesLedgerName.trim()) throw new Error("Select the exact Sales ledger from Tally.");
      const payload = await callTally({
        ...options,
        accountingMode: mode === "accounting",
        voucherAction: mode === "stock-alter" ? "Alter" : "Create",
        voucherNumberSuffix: mode === "stock-test" ? voucherSuffix.trim() || "-STK" : "",
      });
      setReadiness(payload.readiness ?? null);
      if (!payload.httpOk && !payload.attemptedVariants && !payload.readiness) {
        throw new Error(payload.error || payload.message || "Tally push failed.");
      }
      setDebug({
        response: payload.response,
        requestXml: payload.requestXml,
        counters: payload.tallyResult?.counters,
        attemptedVariants: payload.attemptedVariants,
        successfulVariant: payload.successfulVariant,
      });
      if (!payload.ok) throw new Error(payload.error || payload.message || "Tally push failed.");
      setMessage(
        mode === "stock-test"
          ? "Stock test voucher pushed to Tally successfully. Original voucher number is likely blocked by an existing voucher."
          : mode === "stock-alter"
            ? "Existing Tally voucher altered into stock invoice successfully."
          : mode === "inventory"
            ? "Stock invoice pushed to Tally successfully."
            : "Accounting invoice pushed to Tally successfully.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tally push failed.");
    } finally {
      setLoading(false);
    }
  }

  async function callTally(body: Record<string, unknown>) {
    const response = await fetch(`/api/invoices/${invoiceId}/tally/push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({ error: "Tally returned an unreadable response." }));
    return { ...payload, httpOk: response.ok };
  }

  return (
    <div className="space-y-4 rounded-md border border-[#d8dfd7] bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-bold">Tally Push</h2>
          <p className="text-sm text-[#5d6b60]">Check readiness first, then push stock invoice. Use accounting push only for emergency fallback.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => checkReadiness()} disabled={loading || loadingLedgers}>
            {loading ? "Checking..." : "Check Tally readiness"}
          </Button>
          <Button type="button" onClick={() => pushToTally("inventory")} disabled={loading || loadingLedgers}>
            {loading ? "Working..." : "Push stock invoice"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="text-sm font-semibold">Sales ledger from Tally</span>
          <select
            className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2"
            value={salesLedgerName}
            onChange={(event) => setSalesLedgerName(event.target.value)}
          >
            <option value="">{loadingLedgers ? "Loading..." : "Select sales ledger"}</option>
            {salesLedgers.map((ledger) => (
              <option key={`${ledger.group}-${ledger.name}`} value={ledger.name}>
                {ledger.name}
              </option>
            ))}
          </select>
        </label>
        <TextDatalist
          label="Voucher type"
          value={voucherTypeName}
          onChange={setVoucherTypeName}
          options={voucherTypes.map((voucherType) => ({
            value: voucherType.name,
            hint: `${voucherType.parent}${voucherType.affectsStock ? " | stock" : " | no stock"}`,
          }))}
        />
        <LedgerSelect label="CGST ledger" value={cgstLedgerName} onChange={setCgstLedgerName} ledgers={taxLedgers} disabled={isInterstate || gstThroughSalesLedger} />
        <LedgerSelect label="SGST ledger" value={sgstLedgerName} onChange={setSgstLedgerName} ledgers={taxLedgers} disabled={isInterstate || gstThroughSalesLedger} />
      </div>

      <div className="grid gap-2 rounded-md bg-[#f6f7f4] p-3 md:grid-cols-2 xl:grid-cols-4">
        <Check label="Create client ledger if missing" checked={createMissingPartyLedger} onChange={setCreateMissingPartyLedger} />
        <Check label="Stock item billing" checked={inventoryMode} onChange={setInventoryMode} />
        <Check label="Create missing stock items" checked={createMissingStockItems} onChange={setCreateMissingStockItems} disabled={!inventoryMode} />
        <Check label="Interstate / IGST" checked={isInterstate} onChange={setIsInterstate} />
        <Check label="GST handled by sales ledger" checked={gstThroughSalesLedger} onChange={setGstThroughSalesLedger} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setShowAdvanced((current) => !current)}>
          {showAdvanced ? "Hide advanced Tally options" : "Show advanced Tally options"}
        </Button>
        {showAdvanced ? (
          <>
            <Button type="button" variant="secondary" onClick={() => pushToTally("stock-test")} disabled={loading || loadingLedgers}>
              Push stock test voucher
            </Button>
            <Button type="button" variant="secondary" onClick={() => pushToTally("stock-alter")} disabled={loading || loadingLedgers}>
              Replace existing as stock
            </Button>
            <Button type="button" variant="secondary" onClick={() => pushToTally("accounting")} disabled={loading || loadingLedgers}>
              Emergency accounting push
            </Button>
          </>
        ) : null}
      </div>

      {showAdvanced ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 rounded-md border border-[#d8dfd7] p-3">
          <LedgerSelect label="IGST ledger" value={igstLedgerName} onChange={setIgstLedgerName} ledgers={taxLedgers} disabled={!isInterstate || gstThroughSalesLedger} />
          <Field label="Discount ledger" value={discountLedgerName} onChange={setDiscountLedgerName} placeholder="Only if discount exists" />
          <TextDatalist
            label="Godown / location"
            value={godownName}
            onChange={setGodownName}
            options={godowns.map((godown) => ({ value: godown.name, hint: godown.parent || "" }))}
            placeholder="Optional, exact Tally name"
            disabled={!inventoryMode}
          />
          <Field label="Test voucher suffix" value={voucherSuffix} onChange={setVoucherSuffix} placeholder="-STK" disabled={!inventoryMode} />
        </div>
      ) : null}

      {!inventoryMode ? (
        <p className="rounded-md border border-[#d8dfd7] bg-[#eef3ee] p-3 text-sm">
          Accounting fallback mode is selected: this creates a Tally accounting invoice without stock item movement.
        </p>
      ) : (
        <p className="rounded-md border border-[#f0d48a] bg-[#fff8e5] p-3 text-sm text-[#6f4b00]">
          Stock billing is ON. If an accounting voucher was already pushed with this invoice number, use Replace existing as stock or test with a suffix first.
        </p>
      )}

      {readiness ? <ReadinessPanel readiness={readiness} /> : null}
      {readiness?.voucherTypeIssue ? (
        <p className="rounded-md border border-[#f0d48a] bg-[#fff8e5] p-3 text-sm text-[#6f4b00]">{readiness.voucherTypeIssue}</p>
      ) : null}
      {readiness?.godownIssue ? (
        <p className="rounded-md border border-[#f0d48a] bg-[#fff8e5] p-3 text-sm text-[#6f4b00]">{readiness.godownIssue}</p>
      ) : null}
      {readiness?.missingLedgers.length ? (
        <p className="rounded-md border border-[#f0d48a] bg-[#fff8e5] p-3 text-sm text-[#6f4b00]">
          Pick the exact ledger names from the dropdowns above. If your Sales ledger already handles GST, keep `GST handled by sales ledger` turned on.
        </p>
      ) : null}
      {message ? <p className="rounded-md bg-[#fbfcfa] p-3 text-sm text-[#5d6b60]">{message}</p> : null}
      {debug?.attemptedVariants?.length && !debug.attemptedVariants.some((variant) => variant.ok) ? (
        <StockFailureHelp />
      ) : null}
      {debug ? <DebugPanel debug={debug} /> : null}
    </div>
  );
}

function StockFailureHelp() {
  return (
    <div className="rounded-md border border-[#f0d48a] bg-[#fff8e5] p-4 text-sm text-[#6f4b00]">
      <p className="font-bold">Tally is rejecting every stock invoice format.</p>
      <p className="mt-2">
        Accounting push is working, so ledgers are fine. The remaining blocker is usually company-specific inventory setup.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Enter exact Godown / location if your Tally requires godown-wise stock.</li>
        <li>Check whether Sales voucher type allows Item Invoice mode.</li>
        <li>Check stock item GST setup in Tally for the billed items.</li>
        <li>Open Tally import exceptions after the failed push for the exact reason.</li>
      </ul>
      <p className="mt-2 font-semibold">Open Tally technical details below and use the Request XML preview for manual import testing.</p>
    </div>
  );
}

function LedgerSelect({
  label,
  value,
  onChange,
  ledgers,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ledgers: LedgerOption[];
  disabled?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-semibold">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2 disabled:bg-[#eef3ee] disabled:text-[#7b877f]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={`tally-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        disabled={disabled}
      />
      <datalist id={`tally-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
        {ledgers.map((ledger) => (
          <option key={`${label}-${ledger.group}-${ledger.name}`} value={ledger.name}>
            {ledger.group}
          </option>
        ))}
      </datalist>
    </label>
  );
}

function bestLedger(ledgers: LedgerOption[], token: string) {
  return ledgers.find((ledger) => ledger.name.toLowerCase().includes(token))?.name || "";
}

function ReadinessPanel({ readiness }: { readiness: Readiness }) {
  return (
    <div className={`rounded-md border p-3 text-sm ${readiness.ok ? "border-[#b7dfc5] bg-[#eef8f1]" : "border-[#f0d48a] bg-[#fff8e5]"}`}>
      <p className="font-bold">{readiness.ok ? "Ready for Tally" : "Action needed before push"}</p>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <Status label="Client ledger" ok={!readiness.missingPartyLedger} value={readiness.missingPartyLedger ? "Missing" : "OK"} />
        <Status label="Ledgers" ok={!readiness.missingLedgers.length} value={readiness.missingLedgers.length ? readiness.missingLedgers.join(", ") : "OK"} />
        <Status
          label="Stock items"
          ok={!readiness.missingStockItems.length}
          value={readiness.mode === "accounting" ? "Not required in safe mode" : readiness.missingStockItems.length ? readiness.missingStockItems.join(", ") : "OK"}
        />
        <Status
          label="Voucher type"
          ok={!readiness.voucherTypeIssue}
          value={
            readiness.mode === "accounting"
              ? "Not required in safe mode"
              : readiness.voucherTypeIssue || (readiness.checked?.stockEnabledVoucherTypes?.length ? "OK" : "No stock-enabled voucher type found")
          }
        />
        <Status
          label="Godown"
          ok={!readiness.godownIssue}
          value={
            readiness.mode === "accounting"
              ? "Not required in safe mode"
              : readiness.godownIssue || readiness.checked?.resolvedGodownName || "Optional / not set"
          }
        />
      </div>
      {readiness.checked?.stockEnabledVoucherTypes?.length ? (
        <p className="mt-2 rounded-md bg-white px-3 py-2 text-sm">
          <span className="font-semibold">Stock-enabled voucher types in Tally:</span>{" "}
          {readiness.checked.stockEnabledVoucherTypes.join(", ")}
        </p>
      ) : null}
      {readiness.checked?.availableGodowns?.length ? (
        <p className="mt-2 rounded-md bg-white px-3 py-2 text-sm">
          <span className="font-semibold">Godowns in Tally:</span> {readiness.checked.availableGodowns.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function Status({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <p className="rounded-md bg-white px-3 py-2">
      <span className="font-semibold">{label}:</span>{" "}
      <span className={ok ? "text-[#17613d]" : "text-[#8a5b00]"}>{value}</span>
    </p>
  );
}

function DebugPanel({
  debug,
}: {
  debug: {
    response?: string;
    requestXml?: string;
    counters?: Record<string, number>;
    attemptedVariants?: AttemptedVariant[];
    successfulVariant?: string;
  };
}) {
  return (
    <details className="rounded-md border border-[#d8dfd7] bg-[#f8faf7] p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Tally technical details</summary>
      {debug.attemptedVariants?.length ? (
        <div className="mt-2 space-y-2">
          <p className="font-semibold">Inventory XML attempts</p>
          {debug.attemptedVariants.map((variant) => (
            <p className="rounded-md bg-white px-2 py-1" key={variant.name}>
              <span className={variant.ok ? "font-semibold text-[#17613d]" : "font-semibold text-[#8a5b00]"}>
                {variant.ok ? "OK" : "Failed"}
              </span>{" "}
              {variant.name}: {variant.message}
            </p>
          ))}
        </div>
      ) : null}
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
  );
}

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="h-4 w-4"
      />
      {label}
    </label>
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

function TextDatalist({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; hint?: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const listId = `tally-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <label>
      <span className="text-sm font-semibold">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2 disabled:bg-[#eef3ee] disabled:text-[#7b877f]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={listId}
        placeholder={placeholder}
        disabled={disabled}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={`${listId}-${option.value}`} value={option.value}>
            {option.hint}
          </option>
        ))}
      </datalist>
    </label>
  );
}
