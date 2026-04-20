import { importRowsSchema } from "@/lib/validation";
import type { ImportRow, Product } from "@/lib/types";
import { importRowsJsonSchema } from "./schema";

type ImportFile = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type ParserInput = {
  sourceType: "image" | "pdf" | "text" | "manual";
  text?: string;
  files?: ImportFile[];
  products?: Product[];
  aliases?: { product_id: string; alias: string; products?: Product | null }[];
};

export async function parseImportRows(input: ParserInput) {
  const productRows = parseWithProductDatabase(input.text ?? "", input.products ?? [], input.aliases ?? []);
  const fallbackRows = fallbackParse(input.text ?? "");
  const canSkipAi = productRows.length > 0 && !(input.files ?? []).length;
  let rows = mergeRows(productRows, fallbackRows);

  if (!canSkipAi && process.env.OPENAI_API_KEY) {
    try {
      rows = mergeRows(rows, await parseWithOpenAIInChunks(input));
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI extraction failed.";
      if (!rows.length) throw new Error(`${message} No local fallback rows could be created.`);
      rows = rows.map((row) => ({
        ...row,
        raw_text: [row.raw_text, `AI warning: ${message}`].filter(Boolean).join("\n"),
        confidence: Math.min(row.confidence ?? 0.35, 0.35),
      }));
    }
  }

  return matchProducts(rows, input.products ?? [], input.aliases ?? []);
}

async function parseWithOpenAIInChunks(input: ParserInput) {
  const textChunks = chunkText(input.text ?? "");
  const rows: ImportRow[] = [];

  for (const [index, file] of (input.files ?? []).entries()) {
    rows.push(
      ...(await parseWithOpenAI({
      ...input,
      text: `File ${index + 1} of ${input.files?.length ?? 1}: ${file.name}`,
      files: [file],
      })),
    );
  }

  for (const [index, chunk] of textChunks.entries()) {
    rows.push(
      ...(await parseWithOpenAI({
      ...input,
      text: `Text chunk ${index + 1} of ${textChunks.length}. Extract every product row from this chunk.\n\n${chunk}`,
      files: [],
      })),
    );
  }

  return dedupeRows(rows);
}

async function parseWithOpenAI(input: ParserInput) {
  // Keep the AI contract strict so the review table receives rows, not prose.
  const content: Record<string, string>[] = [
    {
      type: "input_text",
      text: [
        "Extract plywood, laminate, hardware, furniture, BOQ, or quotation product rows.",
        "Return every row from the full provided source, not only the first visible lines.",
        "If the source has many lines, output all line items. Never stop after the first few rows.",
        "Do not summarize, cap, sample, or stop early. Continue until the source is exhausted.",
        "Return only rows that can become quotation line items.",
        "Use null when a value is missing. Confidence must be 0 to 1.",
        "Keep raw_text as the source line or visible text for traceability.",
        input.text ? `Pasted text:\n${input.text}` : "No pasted text was provided.",
      ].join("\n"),
    },
  ];

  for (const file of input.files ?? []) {
    if (file.mimeType.startsWith("image/")) {
      content.push({ type: "input_image", image_url: file.dataUrl });
    } else if (file.mimeType === "application/pdf") {
      content.push({ type: "input_file", filename: file.name, file_data: file.dataUrl });
    }
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL ?? "gpt-4.1-mini",
      max_output_tokens: Number(process.env.OPENAI_IMPORT_MAX_OUTPUT_TOKENS ?? 6000),
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "quotation_import_rows",
          schema: importRowsJsonSchema,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI extraction failed: ${detail}`);
  }

  const payload = await response.json();
  const json = extractOutputText(payload);
  const parsed = JSON.parse(json) as { rows: unknown[] };
  return importRowsSchema.parse(parsed.rows);
}

function parseWithProductDatabase(
  text: string,
  products: Product[],
  aliases: { product_id: string; alias: string; products?: Product | null }[],
) {
  if (!text.trim() || (!products.length && !aliases.length)) return [];
  const productLookup = new Map(products.map((product) => [product.id, product]));
  const names = [
    ...products.map((product) => ({ label: product.name, product })),
    ...aliases
      .map((alias) => ({ label: alias.alias, product: alias.products ?? productLookup.get(alias.product_id) }))
      .filter((entry): entry is { label: string; product: Product } => Boolean(entry.product)),
  ].sort((left, right) => right.label.length - left.label.length);

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = names.find((entry) => normalize(line).includes(normalize(entry.label)));
      if (!match) return [];
      const numbers = line.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const qty = numbers[0] ?? 1;
      const amountCandidate = numbers.at(-1) ?? null;
      const rateCandidate = numbers.length > 1 ? numbers.at(-2) ?? null : match.product.base_rate;
      const rate = rateCandidate ?? match.product.base_rate ?? 0;
      const amount = amountCandidate && numbers.length > 1 ? amountCandidate : qty * rate;

      return [
        {
          item_name: match.product.name,
          description: match.product.name,
          qty,
          unit: match.product.unit,
          rate,
          amount,
          brand: match.product.brand,
          size: match.product.size,
          thickness: match.product.thickness,
          category: match.product.category,
          confidence: 0.9,
          raw_text: line,
          matched_product_id: match.product.id,
          matched_product_name: match.product.name,
          matched_product_unit: match.product.unit,
          matched_product_rate: match.product.base_rate,
          matched_product_brand: match.product.brand,
          matched_product_size: match.product.size,
          matched_product_thickness: match.product.thickness,
          matched_product_category: match.product.category,
          save_to_product: false,
          approved: true,
          image_url: match.product.image_url,
        } satisfies ImportRow,
      ];
    });
}

function mergeRows(productRows: ImportRow[], aiRows: ImportRow[]) {
  const productLines = new Set(productRows.map((row) => normalize(row.raw_text ?? row.description)));
  return [...productRows, ...aiRows.filter((row) => !productLines.has(normalize(row.raw_text ?? row.description)))];
}

function chunkText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    const nextLength = currentLength + line.length + 1;
    if (current.length >= 40 || nextLength > 6000) {
      chunks.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  }

  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

function dedupeRows(rows: ImportRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [row.item_name, row.description, row.qty, row.rate, row.amount].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractOutputText(payload: unknown): string {
  if (typeof payload !== "object" || !payload) throw new Error("AI response was empty.");
  const outputText = (payload as { output_text?: unknown }).output_text;
  if (typeof outputText === "string") return outputText;
  const stack: unknown[] = [(payload as { output?: unknown }).output];
  while (stack.length) {
    const next = stack.pop();
    if (Array.isArray(next)) stack.push(...next);
    if (typeof next === "object" && next) {
      const item = next as Record<string, unknown>;
      if (item.type === "output_text" && typeof item.text === "string") return item.text;
      stack.push(...Object.values(item));
    }
  }
  throw new Error("AI response did not include structured output text.");
}

function fallbackParse(text: string): ImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const numbers = line.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const qty = numbers[0] ?? null;
    const rate = numbers.length > 1 ? numbers[numbers.length - 2] : null;
    const amount = numbers.length > 1 ? numbers[numbers.length - 1] : qty && rate ? qty * rate : null;
    return {
      item_name: line.replace(/\s+\d.*$/, "").trim() || line,
      description: line,
      qty,
      unit: line.match(/\b(sqft|nos|pcs|sheet|box|kg|ft|mm)\b/i)?.[0] ?? null,
      rate,
      amount,
      brand: null,
      size: line.match(/\b\d+\s?x\s?\d+(?:\s?x\s?\d+)?\b/i)?.[0] ?? null,
      thickness: line.match(/\b\d+(?:\.\d+)?\s?mm\b/i)?.[0] ?? null,
      category: null,
      confidence: 0.35,
      raw_text: line,
    };
  });
}

function matchProducts(
  rows: ImportRow[],
  products: Product[],
  aliases: { product_id: string; alias: string; products?: Product | null }[],
) {
  return rows.map((row) => {
    const haystack = normalize(
      [row.item_name, row.description, row.raw_text, row.brand, row.size, row.thickness, row.category].filter(Boolean).join(" "),
    );
    const aliasMatch = aliases.find((alias) => haystack.includes(normalize(alias.alias)));
    const productMatch =
      aliasMatch?.products ??
      products.find((product) => {
        const productText = normalize([product.name, product.brand, product.size, product.thickness, product.category].filter(Boolean).join(" "));
        const score = similarity(haystack, productText);
        return score > 0.52 || haystack.includes(normalize(product.name)) || normalize(product.name).includes(haystack);
      });

    return {
      ...row,
      matched_product_id: productMatch?.id ?? aliasMatch?.product_id ?? null,
      matched_product_name: productMatch?.name ?? null,
      matched_product_unit: productMatch?.unit ?? null,
      matched_product_rate: productMatch?.base_rate ?? null,
      matched_product_brand: productMatch?.brand ?? null,
      matched_product_size: productMatch?.size ?? null,
      matched_product_thickness: productMatch?.thickness ?? null,
      matched_product_category: productMatch?.category ?? null,
      save_to_product: !productMatch,
      approved: true,
    };
  });
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function similarity(left: string, right: string) {
  const a = new Set(left.split(" ").filter(Boolean));
  const b = new Set(right.split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const hits = [...a].filter((token) => b.has(token)).length;
  return hits / Math.max(a.size, b.size);
}
