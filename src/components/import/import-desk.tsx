"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createQuotationFromImport, saveImportedRowsToProducts } from "@/app/actions";
import { Button } from "@/components/button";
import { inr } from "@/lib/money";
import type { ImportRow } from "@/lib/types";

type Tab = "images" | "pdf" | "text" | "manual";
type Preview = { name: string; type: string; url: string };
type ClientLedgerCheck = {
  found: boolean;
  matches: { id: string; name: string; address: string | null; gst_number: string | null; score: number }[];
};

const maxUploadFiles = 3;
const maxUploadBytes = 1_800_000;

const blankRow: ImportRow = {
  item_name: "",
  description: "",
  qty: 1,
  unit: "Nos",
  rate: 0,
  amount: 0,
  brand: null,
  size: null,
  thickness: null,
  category: null,
  confidence: null,
  raw_text: null,
  approved: true,
  save_to_product: true,
};

const terms =
  "1. Prices are valid for 15 days.\n2. Taxes are charged as applicable.\n3. Delivery and installation, if any, will be billed separately.\n4. Payment terms as mutually agreed.";

export function ImportDesk() {
  const [tab, setTab] = useState<Tab>("images");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientGstNumber, setClientGstNumber] = useState("");
  const [ledgerCheck, setLedgerCheck] = useState<ClientLedgerCheck | null>(null);
  const [checkingLedger, setCheckingLedger] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const approvedRows = useMemo(() => rows.filter((row) => row.approved), [rows]);

  async function addFiles(nextFiles: FileList | File[]) {
    const accepted = Array.from(nextFiles).filter((file) => {
      if (tab === "images") return file.type.startsWith("image/");
      if (tab === "pdf") return file.type === "application/pdf";
      return true;
    });
    setError("");
    setFiles((current) => [...current, ...accepted].slice(0, maxUploadFiles));
    setPreviews((current) => [
      ...current,
      ...accepted.map((file) => ({ name: file.name, type: file.type, url: URL.createObjectURL(file) })),
    ].slice(0, maxUploadFiles));
    if (accepted.length + files.length > maxUploadFiles) {
      setMessage(`Only first ${maxUploadFiles} files were added. Upload the remaining files in a second batch.`);
    }
  }

  async function extractRows() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.set("source_type", tab === "images" ? "image" : tab);
      formData.set("text", text);
      const uploadFiles = await Promise.all(files.map((file) => (file.type.startsWith("image/") ? compressImage(file) : file)));
      const totalUploadSize = uploadFiles.reduce((sum, file) => sum + file.size, 0);
      if (totalUploadSize > maxUploadBytes) {
        throw new Error("Images are still too large for online import. Upload fewer images at once or crop the screenshots and try again.");
      }
      uploadFiles.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/import/extract", { method: "POST", body: formData });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(cleanImportError(payload.error ?? "Extraction failed."));

      const firstImage = previews.find((preview) => preview.type.startsWith("image/"))?.url ?? null;
      setRows(
        payload.rows.map((row: ImportRow) => ({
          ...row,
          image_url: firstImage,
          approved: row.approved ?? true,
          save_to_product: row.save_to_product ?? !row.matched_product_id,
        })),
      );
      setBatchId(payload.batch_id);
      const matchedCount = payload.rows.filter((row: ImportRow) => row.matched_product_id).length;
      setMessage(
        [
          `Extracted ${payload.rows.length} row${payload.rows.length === 1 ? "" : "s"} for review.`,
          matchedCount ? `${matchedCount} row${matchedCount === 1 ? "" : "s"} matched with Tally stock/product master.` : null,
          payload.warning,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (err: unknown) {
      setError(cleanImportError(err instanceof Error ? err.message : "Could not extract rows."));
    } finally {
      setLoading(false);
    }
  }

  function updateRow(index: number, patch: Partial<ImportRow>) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, ...patch };
        if ("qty" in patch || "rate" in patch) {
          const qty = Number(next.qty) || 0;
          const rate = Number(next.rate) || 0;
          next.amount = Math.round(qty * rate * 100) / 100;
        }
        return next;
      }),
    );
  }

  function rowsFormData() {
    const formData = new FormData();
    formData.set("rows", JSON.stringify(rows));
    return formData;
  }

  function saveProducts() {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await saveImportedRowsToProducts(rowsFormData());
        setMessage("Selected rows saved to product master.");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not save products.");
      }
    });
  }

  function createQuotation(formData: FormData) {
    formData.set("rows", JSON.stringify(rows));
    startTransition(async () => {
      try {
        await createQuotationFromImport(formData);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not create quotation.");
      }
    });
  }

  async function checkClientLedger(name = clientName) {
    const trimmed = name.trim();
    setLedgerCheck(null);
    if (!trimmed) return;
    setCheckingLedger(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/check?name=${encodeURIComponent(trimmed)}`);
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "Could not check client ledger.");
      setLedgerCheck(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not check client ledger.");
    } finally {
      setCheckingLedger(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-[#d8dfd7] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            ["images", "Upload Images"],
            ["pdf", "Upload PDF"],
            ["text", "Paste Text"],
            ["manual", "Manual Add"],
          ].map(([id, label]) => (
            <button
              className={`rounded-md px-4 py-2 text-sm font-semibold ${
                tab === id ? "bg-[#1f6f50] text-white" : "border border-[#cdd6cf] bg-white hover:bg-[#eef3ee]"
              }`}
              key={id}
              onClick={() => setTab(id as Tab)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "images" || tab === "pdf" ? (
          <div
            className="mt-4 rounded-md border border-dashed border-[#9fb2a4] bg-[#f6f7f4] p-8 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              addFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={inputRef}
              className="hidden"
              type="file"
              multiple={tab === "images"}
              accept={tab === "images" ? "image/*" : "application/pdf"}
              onChange={(event) => event.target.files && addFiles(event.target.files)}
            />
            <p className="text-lg font-bold">Drop files here</p>
            <p className="mt-1 text-sm text-[#5d6b60]">
              {tab === "images" ? "Upload multiple screenshots or product photos." : "Upload a PDF quotation or BOQ."}
            </p>
            <Button className="mt-4" type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
              Choose files
            </Button>
          </div>
        ) : null}

        {tab === "text" ? (
          <textarea
            className="mt-4 min-h-48 w-full rounded-md border border-[#cdd6cf] px-3 py-2 outline-none focus:border-[#1f6f50]"
            placeholder="Paste quotation text, product list, WhatsApp text, or BOQ rows here."
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        ) : null}

        {tab === "manual" ? (
          <div className="mt-4 rounded-md bg-[#f6f7f4] p-4">
            <p className="font-semibold">Manual add is a backup.</p>
            <p className="text-sm text-[#5d6b60]">Use it only when there is no source image, PDF, or text to extract.</p>
            <Button className="mt-4" type="button" onClick={() => setRows((current) => [...current, { ...blankRow }])}>
              Add blank row
            </Button>
          </div>
        ) : null}

        {previews.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {previews.map((preview) => (
              <div className="rounded-md border border-[#d8dfd7] bg-white p-3" key={preview.url}>
                {preview.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={preview.name} className="h-32 w-full rounded-md object-cover" src={preview.url} />
                ) : (
                  <div className="grid h-32 place-items-center rounded-md bg-[#eef3ee] text-sm font-semibold">PDF</div>
                )}
                <p className="mt-2 truncate text-sm font-semibold">{preview.name}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" onClick={extractRows} disabled={loading || (tab !== "manual" && !files.length && !text)}>
            {loading ? "Extracting..." : "Extract rows"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setFiles([]);
              setPreviews([]);
              setRows([]);
              setText("");
              setBatchId(null);
            }}
          >
            Clear import
          </Button>
        </div>
        {batchId ? <p className="mt-3 text-xs text-[#5d6b60]">Batch: {batchId}</p> : null}
        {error ? <p className="mt-3 rounded-md bg-[#fff0ed] p-3 text-sm text-[#b42318]">{error}</p> : null}
        {message ? <p className="mt-3 rounded-md bg-[#eef8f1] p-3 text-sm text-[#17613d]">{message}</p> : null}
      </section>

      {rows.length ? (
        <>
          <ReviewTable rows={rows} updateRow={updateRow} removeRow={(index) => setRows(rows.filter((_, i) => i !== index))} />
          <section className="grid gap-4 rounded-md border border-[#d8dfd7] bg-white p-4 lg:grid-cols-[1fr_1fr]">
            <div>
              <h2 className="text-xl font-bold">Product master</h2>
              <p className="mt-1 text-sm text-[#5d6b60]">Save selected rows as products or aliases after review.</p>
              <Button className="mt-4" type="button" onClick={saveProducts} disabled={isPending}>
                Save selected rows to product master
              </Button>
            </div>
            <form action={createQuotation} className="space-y-3">
              <h2 className="text-xl font-bold">Create quotation from import</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Client name"
                  name="client_name"
                  required
                  value={clientName}
                  onChange={(event) => {
                    setClientName(event.target.value);
                    setLedgerCheck(null);
                  }}
                  onBlur={(event) => checkClientLedger(event.target.value)}
                />
                <Field label="Project name" name="project_name" required />
                <Field
                  label="GST number"
                  name="gst_number"
                  value={clientGstNumber}
                  onChange={(event) => setClientGstNumber(event.target.value)}
                />
                <Field label="Date" name="quote_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
                <Field label="GST %" name="gst_percent" type="number" defaultValue="18" required />
                <label className="block">
                  <span className="text-sm font-semibold">Discount type</span>
                  <select name="discount_type" className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" defaultValue="amount">
                    <option value="amount">Amount</option>
                    <option value="percent">Percent</option>
                  </select>
                </label>
                <Field label="Discount" name="discount_value" type="number" defaultValue="0" />
              </div>
              <label className="block">
                <span className="text-sm font-semibold">Address</span>
                <textarea
                  name="address"
                  className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2"
                  value={clientAddress}
                  onChange={(event) => setClientAddress(event.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Terms</span>
                <textarea name="terms" className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2" defaultValue={terms} />
              </label>
              <LedgerCheckPanel
                checking={checkingLedger}
                clientName={clientName}
                ledgerCheck={ledgerCheck}
                onCheck={() => checkClientLedger()}
                onUse={(match) => {
                  setClientName(match.name);
                  setClientAddress(match.address || "");
                  setClientGstNumber(match.gst_number || "");
                  setLedgerCheck({ found: true, matches: [match] });
                }}
              />
              <Button disabled={isPending || !approvedRows.length}>Create quotation from import</Button>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}

async function compressImage(file: File) {
  const maxSide = 1000;
  const quality = 0.48;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);

  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (blob && blob.size > 550_000) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.34));
  }
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html") || text.trimStart().startsWith("<!DOCTYPE html") || text.includes("__next_error__")) {
    return {
      error:
        response.status === 413
          ? "The upload is too large for the live server. Upload one cropped image at a time."
          : "The live server returned an error page. Upload one smaller/cropped image and check that OPENAI_API_KEY is set in production.",
    };
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || `Request failed with status ${response.status}.` };
  }
}

function cleanImportError(value: string) {
  const message = String(value || "").replace(/\s+/g, " ").trim();
  if (!message) return "Import extraction failed. Please try again.";
  if (message.includes("OPENAI_API_KEY") || message.toLowerCase().includes("api key")) {
    return "AI import is not configured on the live site. Add OPENAI_API_KEY in the deployment environment and redeploy.";
  }
  if (message.toLowerCase().includes("maximum") || message.toLowerCase().includes("too large") || message.includes("413")) {
    return "The upload is too large for the live site. Upload fewer/cropped images and try again.";
  }
  if (message.toLowerCase().includes("rate limit")) {
    return "AI import is temporarily rate-limited. Please wait a minute and try again.";
  }
  if (message.startsWith("AI extraction failed")) {
    return "AI could not read this image clearly. Try a sharper/cropped image or paste the text instead.";
  }
  return message.length > 220 ? `${message.slice(0, 220)}...` : message;
}

function ReviewTable({
  rows,
  updateRow,
  removeRow,
}: {
  rows: ImportRow[];
  updateRow: (index: number, patch: Partial<ImportRow>) => void;
  removeRow: (index: number) => void;
}) {
  const [conversionFactors, setConversionFactors] = useState<Record<number, string>>({});
  const total = rows.filter((row) => row.approved).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  function applyTallyStock(index: number, row: ImportRow) {
    if (!row.matched_product_name) return;
    const qty = Number(row.qty) || 0;
    const rate = Number(row.rate ?? row.matched_product_rate ?? 0);
    updateRow(index, {
      item_name: row.matched_product_name,
      description: row.matched_product_name,
      unit: row.matched_product_unit || row.unit || "Nos",
      rate,
      amount: Math.round(qty * rate * 100) / 100,
      brand: row.matched_product_brand ?? row.brand,
      size: row.matched_product_size ?? row.size,
      thickness: row.matched_product_thickness ?? row.thickness,
      category: row.matched_product_category ?? row.category,
      save_to_product: false,
    });
  }

  function convertToTallyUnit(index: number, row: ImportRow) {
    const targetUnit = row.matched_product_unit;
    const sourceUnit = row.unit;
    const factor = Number(conversionFactors[index]);
    if (!targetUnit || !sourceUnit || !factor || factor <= 0) return;

    const qty = Number(row.qty) || 0;
    const rate = Number(row.rate) || 0;
    const nextQty = Math.round((qty / factor) * 100) / 100;
    const nextRate = Math.round(rate * factor * 100) / 100;
    const nextAmount = Math.round(nextQty * nextRate * 100) / 100;
    updateRow(index, {
      item_name: row.matched_product_name || row.item_name,
      description: row.matched_product_name || row.description,
      qty: nextQty,
      unit: targetUnit,
      rate: nextRate,
      amount: nextAmount,
      brand: row.matched_product_brand ?? row.brand,
      size: row.matched_product_size ?? row.size,
      thickness: row.matched_product_thickness ?? row.thickness,
      category: row.matched_product_category ?? row.category,
      save_to_product: false,
    });
  }

  return (
    <section className="overflow-hidden rounded-md border border-[#d8dfd7] bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[#d8dfd7] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Review extracted rows</h2>
          <p className="text-sm text-[#5d6b60]">Edit fast, approve rows, and choose what enters the product master.</p>
        </div>
        <p className="font-bold">Approved total: {inr(total)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1520px] w-full text-sm">
          <thead className="bg-[#eef3ee] text-left">
            <tr>
              {[
                "Use",
                "Product",
                "Description",
                "Qty",
                "Unit",
                "Rate",
                "Amount",
                "Brand",
                "Size",
                "Thick.",
                "Category",
                "Match",
                "Convert",
                "Save product",
                "",
              ].map((heading) => (
                <th className="px-3 py-3 font-semibold" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className="border-t border-[#edf0ed]" key={index}>
                <td className="px-3 py-2">
                  <input checked={!!row.approved} onChange={(event) => updateRow(index, { approved: event.target.checked })} type="checkbox" />
                </td>
                <Cell value={row.item_name} onChange={(value) => updateRow(index, { item_name: value })} />
                <Cell value={row.description} onChange={(value) => updateRow(index, { description: value })} wide />
                <NumberCell value={row.qty} onChange={(value) => updateRow(index, { qty: value })} />
                <Cell value={row.unit ?? ""} onChange={(value) => updateRow(index, { unit: value })} small />
                <NumberCell value={row.rate} onChange={(value) => updateRow(index, { rate: value })} />
                <NumberCell value={row.amount} onChange={(value) => updateRow(index, { amount: value })} />
                <Cell value={row.brand ?? ""} onChange={(value) => updateRow(index, { brand: value || null })} />
                <Cell value={row.size ?? ""} onChange={(value) => updateRow(index, { size: value || null })} />
                <Cell value={row.thickness ?? ""} onChange={(value) => updateRow(index, { thickness: value || null })} small />
                <Cell value={row.category ?? ""} onChange={(value) => updateRow(index, { category: value || null })} />
                <td className="px-3 py-2 text-xs">
                  {row.matched_product_name ? (
                    <div className="space-y-2">
                      <span className="block rounded-md bg-[#dff3e7] px-2 py-1 font-semibold text-[#17613d]">
                        Tally: {row.matched_product_name}
                      </span>
                      <p className="text-[#5d6b60]">
                        {row.matched_product_unit || "unit"} {row.matched_product_rate ? `@ ${inr(row.matched_product_rate)}` : ""}
                      </p>
                      <Button type="button" variant="secondary" onClick={() => applyTallyStock(index, row)}>
                        Use Tally stock
                      </Button>
                    </div>
                  ) : (
                    <span className="rounded-md bg-[#fff4cc] px-2 py-1 font-semibold text-[#775f00]">No Tally stock match</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {row.matched_product_name && row.matched_product_unit && normalize(row.unit || "") !== normalize(row.matched_product_unit) ? (
                    <div className="w-44 space-y-2 rounded-md border border-[#d8dfd7] bg-[#fbfcfa] p-2">
                      <p className="font-semibold">
                        1 {row.matched_product_unit} =
                      </p>
                      <div className="flex items-center gap-1">
                        <input
                          className="w-20 rounded-md border border-[#cdd6cf] px-2 py-1"
                          type="number"
                          min="0"
                          step="0.01"
                          value={conversionFactors[index] ?? ""}
                          onChange={(event) =>
                            setConversionFactors((current) => ({ ...current, [index]: event.target.value }))
                          }
                          placeholder="factor"
                        />
                        <span>{row.unit || "unit"}</span>
                      </div>
                      <Button type="button" variant="secondary" onClick={() => convertToTallyUnit(index, row)}>
                        Convert
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[#5d6b60]">Same unit</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    checked={!!row.save_to_product}
                    onChange={(event) => updateRow(index, { save_to_product: event.target.checked })}
                    type="checkbox"
                  />
                </td>
                <td className="px-3 py-2">
                  <Button type="button" variant="secondary" onClick={() => removeRow(index)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({ value, onChange, wide, small }: { value: string; onChange: (value: string) => void; wide?: boolean; small?: boolean }) {
  return (
    <td className="px-3 py-2">
      <input
        className={`rounded-md border border-[#cdd6cf] px-2 py-2 ${wide ? "w-64" : small ? "w-24" : "w-40"}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </td>
  );
}

function NumberCell({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <td className="px-3 py-2">
      <input
        className="w-28 rounded-md border border-[#cdd6cf] px-2 py-2"
        type="number"
        step="0.01"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    </td>
  );
}

function LedgerCheckPanel({
  checking,
  clientName,
  ledgerCheck,
  onCheck,
  onUse,
}: {
  checking: boolean;
  clientName: string;
  ledgerCheck: ClientLedgerCheck | null;
  onCheck: () => void;
  onUse: (match: ClientLedgerCheck["matches"][number]) => void;
}) {
  return (
    <div className="rounded-md border border-[#d8dfd7] bg-[#fbfcfa] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Client ledger check</p>
          <p className="text-sm text-[#5d6b60]">Checks the synced Tally client ledger list before creating the quotation.</p>
        </div>
        <Button type="button" variant="secondary" onClick={onCheck} disabled={checking || !clientName.trim()}>
          {checking ? "Checking..." : "Check ledger"}
        </Button>
      </div>

      {ledgerCheck ? (
        <div className="mt-3 space-y-2 text-sm">
          {ledgerCheck.found ? (
            <p className="rounded-md bg-[#dff3e7] px-3 py-2 font-semibold text-[#17613d]">Client ledger already exists.</p>
          ) : (
            <p className="rounded-md bg-[#fff4cc] px-3 py-2 font-semibold text-[#775f00]">
              No exact ledger found. Pick a close match or continue as a new client.
            </p>
          )}

          {ledgerCheck.matches.slice(0, 3).map((match) => (
            <button
              className="block w-full rounded-md border border-[#d8dfd7] bg-white px-3 py-2 text-left hover:bg-[#eef3ee]"
              key={match.id}
              onClick={() => onUse(match)}
              type="button"
            >
              <span className="font-semibold">{match.name}</span>
              {match.gst_number ? <span className="ml-2 text-[#5d6b60]">GSTIN: {match.gst_number}</span> : null}
              {match.address ? <span className="mt-1 block truncate text-xs text-[#5d6b60]">{match.address}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input className="mt-1 w-full rounded-md border border-[#cdd6cf] px-3 py-2 outline-none focus:border-[#1f6f50]" {...inputProps} />
    </label>
  );
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
