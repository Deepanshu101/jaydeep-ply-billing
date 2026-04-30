"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { calculateTotals, round } from "@/lib/calculations";
import { inr } from "@/lib/money";
import { readTallyItemMeta, stripTallyItemMeta, writeTallyItemMeta } from "@/lib/tally-item-meta";
import type { LineItem, Quotation } from "@/lib/types";
import { Button } from "./button";

const defaultTerms =
  "1. Prices are valid for 15 days.\n2. Taxes are charged as applicable.\n3. Delivery and installation, if any, will be billed separately.\n4. Payment terms as mutually agreed.";

const emptyItem: LineItem = {
  description: "",
  specification: "",
  qty: 1,
  unit: "Nos",
  rate: 0,
  amount: 0,
};

type AlternateRate = {
  rate: string;
  per: string;
  factor: string;
};

type PricingMode = "dealer" | "project" | "retail" | "custom";
type ItemPricing = {
  baseRate: number;
};

const pricingPresets: Record<PricingMode, number> = {
  dealer: 8,
  project: 15,
  retail: 22,
  custom: 15,
};

export function QuotationForm({
  quotation,
  productOptions = [],
  clientOptions = [],
  initialClientId,
}: {
  quotation?: Quotation;
  productOptions?: ProductOption[];
  clientOptions?: ClientOption[];
  initialClientId?: string;
}) {
  const router = useRouter();
  const initialRows = useMemo(() => {
    const source = quotation?.quotation_items?.length ? quotation.quotation_items : [{ ...emptyItem }];
    const preparedItems: LineItem[] = [];
    const preparedAlternateRates: Record<number, AlternateRate> = {};

    source.forEach((item, index) => {
      const meta = readTallyItemMeta(item.specification);
      preparedItems.push({
        ...item,
        specification: stripTallyItemMeta(item.specification),
      });
      if (meta) {
        preparedAlternateRates[index] = {
          rate: String(meta.rate),
          per: meta.per,
          factor: String(meta.factor),
        };
      }
    });

    return { preparedItems, preparedAlternateRates };
  }, [quotation?.quotation_items]);
  const [items, setItems] = useState<LineItem[]>(initialRows.preparedItems);
  const initialClient = quotation?.customer_id || initialClientId
    ? clientOptions.find((client) => client.id === (quotation?.customer_id ?? initialClientId))
    : clientOptions.find((client) => normalize(client.name) === normalize(quotation?.client_name ?? ""));
  const [selectedClientId, setSelectedClientId] = useState(initialClient?.id ?? "");
  const [clientName, setClientName] = useState(quotation?.client_name ?? initialClient?.name ?? "");
  const [clientAddress, setClientAddress] = useState(quotation?.address ?? initialClient?.address ?? "");
  const [clientGstNumber, setClientGstNumber] = useState(quotation?.gst_number ?? initialClient?.gst_number ?? "");
  const [gstPercent, setGstPercent] = useState(quotation?.gst_percent ?? 18);
  const [discountType, setDiscountType] = useState<"amount" | "percent">(quotation?.discount_type ?? "amount");
  const [discountValue, setDiscountValue] = useState(Number(quotation?.discount_value ?? 0));
  const [pricingMode, setPricingMode] = useState<PricingMode>("project");
  const [marginPercent, setMarginPercent] = useState(Number(quotation?.expected_margin_percent ?? pricingPresets.project));
  const [showShipTo, setShowShipTo] = useState(Boolean(quotation?.ship_to_enabled));
  const [alternateRates, setAlternateRates] = useState<Record<number, AlternateRate>>(initialRows.preparedAlternateRates);
  const [itemPricing, setItemPricing] = useState<Record<number, ItemPricing>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const totals = useMemo(() => calculateTotals(items, gstPercent, discountValue, discountType), [items, gstPercent, discountValue, discountType]);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function setBaseRate(index: number, baseRate: number) {
    setItemPricing((current) => ({
      ...current,
      [index]: { baseRate: round(baseRate) },
    }));
  }

  function itemBaseRate(index: number) {
    const tracked = itemPricing[index]?.baseRate;
    if (Number.isFinite(tracked)) return Number(tracked);
    return Number(items[index]?.rate || 0);
  }

  function sellingRateFromBase(baseRate: number, margin = marginPercent) {
    return round(Number(baseRate || 0) * (1 + Number(margin || 0) / 100));
  }

  function applyProduct(index: number, value: string) {
    const product = productOptions.find((option) => normalize(option.name) === normalize(value));
    if (!product) {
      updateItem(index, { description: value });
      return;
    }
    const baseRate = Number(product.baseRate ?? product.rate ?? 0);
    const sellingRate = sellingRateFromBase(baseRate);
    setBaseRate(index, baseRate);
    updateItem(index, {
      description: product.name,
      specification: [product.brand, product.size, product.thickness, product.category].filter(Boolean).join(" | "),
      unit: product.unit || "Nos",
      rate: sellingRate,
    });
    setAlternateRates((current) => ({
      ...current,
      [index]: { rate: String(sellingRate), per: product.unit || "Nos", factor: "1" },
    }));
  }

  function applyPricingMode(nextMode: PricingMode) {
    setPricingMode(nextMode);
    const nextMargin = nextMode === "custom" ? marginPercent : pricingPresets[nextMode];
    setMarginPercent(nextMargin);
    applyMarginToAll(nextMargin);
  }

  function applyMarginToAll(nextMargin = marginPercent) {
    setItems((current) =>
      current.map((item, index) => {
        const baseRate = itemBaseRate(index);
        if (!baseRate) return item;
        return {
          ...item,
          rate: sellingRateFromBase(baseRate, nextMargin),
        };
      }),
    );
    setAlternateRates((current) => {
      const next = { ...current };
      items.forEach((item, index) => {
        const baseRate = itemBaseRate(index);
        if (!baseRate) return;
        next[index] = {
          ...alternateRateFor(index, current),
          rate: String(sellingRateFromBase(baseRate, nextMargin)),
          per: item.unit || alternateRateFor(index, current).per,
        };
      });
      return next;
    });
  }

  function applyClient(client: ClientOption) {
    setSelectedClientId(client.id);
    setClientName(client.name);
    setClientAddress(client.address || "");
    setClientGstNumber(client.gst_number || "");
  }

  function updateClientName(value: string) {
    setClientName(value);
    setSelectedClientId("");
    const client = findClient(value, "exact");
    if (!client) return;
    applyClient(client);
  }

  function syncClientFromName(value: string) {
    const client = findClient(value, "loose");
    if (client) applyClient(client);
  }

  function findClient(value: string, mode: "exact" | "loose" = "exact") {
    const normalized = normalize(value);
    if (!normalized) return null;
    const exact = clientOptions.find((option) => normalize(option.name) === normalized);
    if (exact || mode === "exact") return exact ?? null;
    return clientOptions.find((option) => normalize(option.name).includes(normalized)) ?? null;
  }

  function alternateRateFor(index: number, source = alternateRates): AlternateRate {
    const item = items[index];
    return source[index] ?? { rate: String(item?.rate ?? 0), per: item?.unit ?? "Nos", factor: "1" };
  }

  function updateAlternateRate(index: number, patch: Partial<AlternateRate>) {
    const next = { ...alternateRateFor(index), ...patch };
    setAlternateRates((current) => ({
      ...current,
      [index]: next,
    }));

    const alternateRate = Number(next.rate);
    const factor = Number(next.factor);
    if (Number.isFinite(alternateRate) && alternateRate > 0 && Number.isFinite(factor) && factor > 0) {
      updateItem(index, { rate: round(alternateRate * factor) });
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const formData = new FormData(event.currentTarget);
      const persistedItems = totals.items.map((item, index) => ({
        ...item,
        specification: writeTallyItemMeta(item.specification, tallyMetaFor(index, item)),
      }));
      formData.set("items", JSON.stringify(persistedItems));
      formData.set("expected_margin_percent", String(marginPercent));
      const response = await fetch(quotation ? `/api/quotations/${quotation.id}` : "/api/quotations", {
        method: quotation ? "PUT" : "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save quotation.");
      router.push(`/quotations/${payload.id}/edit`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save quotation.");
    } finally {
      setSaving(false);
    }
  }

  function tallyMetaFor(index: number, item: LineItem) {
    const alternateRate = alternateRateFor(index);
    const alternateValue = Number(alternateRate.rate);
    const factor = Number(alternateRate.factor);
    const alternateUnit = String(alternateRate.per || "").trim();
    if (!alternateUnit || normalize(alternateUnit) === normalize(item.unit || "")) return null;
    if (!Number.isFinite(alternateValue) || alternateValue <= 0 || !Number.isFinite(factor) || factor <= 0) return null;
    return {
      rate: round(alternateValue),
      per: alternateUnit,
      factor: round(factor),
    };
  }

  useEffect(() => {
    const matchedClient =
      (selectedClientId ? clientOptions.find((client) => client.id === selectedClientId) : null) ??
      findClient(clientName, "exact");
    if (!matchedClient) return;

    setSelectedClientId(matchedClient.id);
    setClientAddress(matchedClient.address || "");
    setClientGstNumber(matchedClient.gst_number || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, clientOptions]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="items" value={JSON.stringify(totals.items)} />
      <input type="hidden" name="expected_margin_percent" value={String(marginPercent)} />
      <section className="grid gap-4 rounded-md border border-[#d8dfd7] bg-white p-4 sm:grid-cols-2">
        <div>
          <Field
            label="Client name"
            name="client_name"
            list="quotation-clients"
            autoComplete="off"
            value={clientName}
            onChange={(event) => updateClientName(event.target.value)}
            onBlur={(event) => syncClientFromName(event.target.value)}
            required
          />
          <select
            className="mt-2 w-full rounded-md border border-[#cdd6cf] bg-[#fbfcfa] px-3 py-2 text-sm outline-none focus:border-[#1f6f50]"
            value={selectedClientId}
            onChange={(event) => {
              const client = clientOptions.find((option) => option.id === event.target.value);
              if (client) applyClient(client);
              else setSelectedClientId("");
            }}
          >
            <option value="">Select synced client</option>
            {clientOptions.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <Field label="Project name" name="project_name" defaultValue={quotation?.project_name} required />
        <Field
          label="GST number"
          name="gst_number"
          value={clientGstNumber}
          onChange={(event) => setClientGstNumber(event.target.value)}
        />
        <Field
          label="Date"
          name="quote_date"
          type="date"
          defaultValue={quotation?.quote_date ?? new Date().toISOString().slice(0, 10)}
          required
        />
        <label className="sm:col-span-2">
          <span className="text-sm font-semibold">Address</span>
          <textarea
            name="address"
            value={clientAddress}
            onChange={(event) => setClientAddress(event.target.value)}
            required
            rows={3}
            className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2 outline-none focus:border-[#1f6f50]"
          />
        </label>
        <datalist id="quotation-clients">
          {clientOptions.map((client) => (
            <option key={client.id} value={client.name}>
              {client.gst_number || client.address || "Synced client"}
            </option>
          ))}
        </datalist>
        <label className="flex items-center gap-2 rounded-md border border-[#d8dfd7] bg-[#f8faf7] px-3 py-2 sm:col-span-2">
          <input
            type="checkbox"
            name="ship_to_enabled"
            checked={showShipTo}
            onChange={(event) => setShowShipTo(event.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm font-semibold">Ship To is different from Bill To</span>
        </label>
        {showShipTo ? (
          <div className="grid gap-4 rounded-md border border-[#d8dfd7] bg-[#fbfcfa] p-4 sm:col-span-2 sm:grid-cols-2">
            <Field label="Ship To name" name="ship_to_name" defaultValue={quotation?.ship_to_name ?? quotation?.client_name ?? ""} />
            <Field label="Ship To GST number" name="ship_to_gst_number" defaultValue={quotation?.ship_to_gst_number ?? quotation?.gst_number ?? ""} />
            <label className="sm:col-span-2">
              <span className="text-sm font-semibold">Ship To address</span>
              <textarea
                name="ship_to_address"
                defaultValue={quotation?.ship_to_address ?? quotation?.address ?? ""}
                rows={3}
                className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2 outline-none focus:border-[#1f6f50]"
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-[#d8dfd7] bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold">Pricing engine</h2>
            <p className="text-sm text-[#5d6b60]">Choose selling mode, adjust margin, and update all item rates from product base rates.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["dealer", "project", "retail", "custom"] as PricingMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => applyPricingMode(mode)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  pricingMode === mode ? "border-[#1f6f50] bg-[#1f6f50] text-white" : "border-[#cdd6cf] bg-white text-[#1d2520]"
                }`}
              >
                {labelForMode(mode)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_180px_160px]">
          <label className="block">
            <span className="text-sm font-semibold">Margin slider</span>
            <input
              className="mt-2 w-full"
              type="range"
              min="0"
              max="40"
              step="0.5"
              value={marginPercent}
              onChange={(event) => {
                setPricingMode("custom");
                setMarginPercent(Number(event.target.value));
              }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Margin %</span>
            <input
              className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2 outline-none focus:border-[#1f6f50]"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={marginPercent}
              onChange={(event) => {
                setPricingMode("custom");
                setMarginPercent(Number(event.target.value));
              }}
            />
          </label>
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={() => applyMarginToAll()}>
              Apply to all items
            </Button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-[#d8dfd7] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#d8dfd7] p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold">Items</h2>
          <Button type="button" variant="secondary" onClick={() => setItems((current) => [...current, { ...emptyItem }])}>
            Add item
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-sm">
            <thead className="bg-[#eef3ee] text-left">
              <tr>
                {["Description", "Specification", "Qty", "Unit", "Rate", "Amount", ""].map((heading) => (
                  <th className="px-3 py-3 font-semibold" key={heading}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {totals.items.map((item, index) => {
                const alternateRate = alternateRateFor(index);
                return (
                  <tr className="border-t border-[#edf0ed]" key={index}>
                    <td className="px-3 py-2">
                      <input
                        list="quotation-products"
                        className="w-full rounded-md border border-[#cdd6cf] px-2 py-2"
                        value={item.description}
                        onChange={(event) => applyProduct(index, event.target.value)}
                        required
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded-md border border-[#cdd6cf] px-2 py-2"
                        value={item.specification}
                        onChange={(event) => updateItem(index, { specification: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-24 rounded-md border border-[#cdd6cf] px-2 py-2"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.qty}
                        onChange={(event) => updateItem(index, { qty: Number(event.target.value) })}
                        required
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-24 rounded-md border border-[#cdd6cf] px-2 py-2"
                        value={item.unit}
                        onChange={(event) => updateItem(index, { unit: event.target.value })}
                        required
                      />
                    </td>
                    <td className="w-56 px-3 py-2">
                      <div className="rounded-md border border-[#cdd6cf] bg-white p-2">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-[#5d6b61]">
                          <span>Base: {inr(itemBaseRate(index))}</span>
                          <button
                            type="button"
                            className="font-semibold text-[#1f6f50]"
                            onClick={() => {
                              const baseRate = itemBaseRate(index);
                              if (!baseRate) return;
                              const sellingRate = sellingRateFromBase(baseRate);
                              updateItem(index, { rate: sellingRate });
                              setAlternateRates((current) => ({
                                ...current,
                                [index]: { ...alternateRateFor(index, current), rate: String(sellingRate) },
                              }));
                            }}
                          >
                            Apply mode
                          </button>
                        </div>
                        <div className="grid grid-cols-[1fr_74px] gap-1">
                          <input
                            className="rounded-md border border-[#cdd6cf] px-2 py-2"
                            type="number"
                            min="0"
                            step="0.01"
                            value={alternateRate.rate}
                            onChange={(event) => updateAlternateRate(index, { rate: event.target.value })}
                            placeholder="Rate"
                            required
                          />
                          <input
                            className="rounded-md border border-[#cdd6cf] px-2 py-2"
                            value={alternateRate.per}
                            onChange={(event) => updateAlternateRate(index, { per: event.target.value })}
                            placeholder={item.unit}
                          />
                        </div>
                        {normalize(alternateRate.per) !== normalize(item.unit || "") ? (
                          <label className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-1 text-[11px] text-[#5d6b61]">
                            <span>1 {item.unit || "unit"} =</span>
                            <input
                              className="rounded-md border border-[#cdd6cf] px-2 py-1 text-xs text-black"
                              type="number"
                              min="0"
                              step="0.01"
                              value={alternateRate.factor}
                              onChange={(event) => updateAlternateRate(index, { factor: event.target.value })}
                              placeholder="1"
                            />
                            <span>{alternateRate.per}</span>
                          </label>
                        ) : null}
                        <p className="mt-1 text-[11px] text-[#5d6b61]">
                          Billing rate: {inr(item.rate)} / {item.unit || "unit"} | Margin: {marginPercent}%
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-semibold">{inr(item.amount)}</td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        disabled={items.length === 1}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <datalist id="quotation-products">
          {productOptions.map((product) => (
            <option key={product.id} value={product.name}>
              {product.unit} {product.rate ? `- ${inr(product.rate)}` : ""}
            </option>
          ))}
        </datalist>
      </section>

      <section className="grid gap-4 rounded-md border border-[#d8dfd7] bg-white p-4 lg:grid-cols-[1fr_360px]">
        <label>
          <span className="text-sm font-semibold">Terms and conditions</span>
          <textarea
            className="mt-1 min-h-40 w-full rounded-md border border-[#cdd6cf] px-3 py-2"
            name="terms"
            defaultValue={quotation?.terms ?? defaultTerms}
          />
        </label>
        <div className="space-y-3">
          <Field
            label="GST %"
            name="gst_percent"
            type="number"
            value={gstPercent}
            onChange={(event) => setGstPercent(Number(event.target.value))}
            required
          />
          <label>
            <span className="text-sm font-semibold">Discount type</span>
            <select
              className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2 outline-none focus:border-[#1f6f50]"
              name="discount_type"
              value={discountType}
              onChange={(event) => setDiscountType(event.target.value as "amount" | "percent")}
            >
              <option value="amount">Amount</option>
              <option value="percent">Percent</option>
            </select>
          </label>
          <Field
            label={discountType === "percent" ? "Discount %" : "Discount amount"}
            name="discount_value"
            type="number"
            min="0"
            step="0.01"
            value={discountValue}
            onChange={(event) => setDiscountValue(Number(event.target.value))}
          />
          <TotalRow label="Subtotal" value={inr(totals.subtotal)} />
          <TotalRow label="Discount" value={`-${inr(totals.discount_amount)}`} />
          <TotalRow label="Taxable subtotal" value={inr(totals.taxable_subtotal)} />
          <TotalRow label="CGST" value={inr(totals.cgst)} />
          <TotalRow label="SGST" value={inr(totals.sgst)} />
          <TotalRow label="Grand total" value={inr(totals.grand_total)} strong />
          <p className="rounded-md bg-[#eef3ee] p-3 text-sm">{totals.amount_in_words}</p>
        </div>
      </section>

      <div className="flex justify-end">
        <div className="flex flex-col items-end gap-2">
          {error ? <p className="max-w-xl text-sm text-[#b42318]">{error}</p> : null}
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : quotation ? "Save quotation" : "Create quotation"}</Button>
        </div>
      </div>
    </form>
  );
}

export type ProductOption = {
  id: string;
  name: string;
  unit: string;
  rate: number | null;
  baseRate?: number | null;
  brand: string | null;
  size: string | null;
  thickness: string | null;
  category: string | null;
};

export type ClientOption = {
  id: string;
  name: string;
  address: string | null;
  gst_number: string | null;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function labelForMode(mode: PricingMode) {
  if (mode === "dealer") return "Dealer";
  if (mode === "project") return "Project";
  if (mode === "retail") return "Retail";
  return "Custom";
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label>
      <span className="text-sm font-semibold">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2 outline-none focus:border-[#1f6f50]"
        {...props}
      />
    </label>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between rounded-md px-3 py-2 ${strong ? "bg-[#1f6f50] text-white" : "bg-[#f6f7f4]"}`}>
      <span>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
