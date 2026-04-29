import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { parseImportRows } from "@/lib/import/parser";
import { applyPricing } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { PricingRule, Product } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    async function loadProductContext() {
      try {
        const [
          { data: products, error: productsError },
          { data: aliases, error: aliasesError },
          { data: pricingRules, error: pricingRulesError },
        ] = await Promise.all([
          supabase.from("products").select("*").eq("is_active", true),
          supabase.from("product_aliases").select("product_id, alias, products(*)"),
          supabase.from("pricing_rules").select("*").eq("is_active", true),
        ]);

        if (
          (productsError?.message && isMissingImportTable(productsError.message)) ||
          (aliasesError?.message && isMissingImportTable(aliasesError.message)) ||
          (pricingRulesError?.message && isMissingImportTable(pricingRulesError.message))
        ) {
          return {
            products: [] as Product[],
            aliases: [] as { product_id: string; alias: string; products?: Product | Product[] | null }[],
            pricingRules: [] as PricingRule[],
            warning: "Product matching is off until you run the latest supabase/schema.sql.",
          };
        }

        if (productsError) throw productsError;
        if (aliasesError) throw aliasesError;
        if (pricingRulesError) throw pricingRulesError;

        return {
          products: (products ?? []) as Product[],
          aliases: (aliases ?? []) as { product_id: string; alias: string; products?: Product | Product[] | null }[],
          pricingRules: (pricingRules ?? []) as PricingRule[],
          warning: null,
        };
      } catch (error) {
        console.warn("[Import product context warning]", error);
        return {
          products: [] as Product[],
          aliases: [] as { product_id: string; alias: string; products?: Product | Product[] | null }[],
          pricingRules: [] as PricingRule[],
          warning: "Product matching and pricing memory are temporarily unavailable. Rows were extracted without master lookups.",
        };
      }
    }

    const formData = await request.formData();
    const sourceType = String(formData.get("source_type") || "text") as "image" | "pdf" | "text" | "manual";
    const text = String(formData.get("text") || "");
    const uploadedFiles = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    const extractedPdfText: string[] = [];
    const pdfWarnings: string[] = [];
    const aiFiles: { name: string; mimeType: string; dataUrl: string }[] = [];

    for (const file of uploadedFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (file.type === "application/pdf") {
        const parsedPdfText = await extractPdfText(buffer);
        if (isUsefulPdfText(parsedPdfText)) {
          extractedPdfText.push(`PDF ${file.name}\n${parsedPdfText}`);
        } else {
          const screenshots = await extractPdfScreenshots(buffer, file.name);
          if (screenshots.length) {
            aiFiles.push(...screenshots);
            pdfWarnings.push(`${file.name}: using page images because selectable PDF text was not usable.`);
          } else if (parsedPdfText) {
            extractedPdfText.push(`PDF ${file.name}\n${parsedPdfText}`);
            pdfWarnings.push(`${file.name}: PDF text looked weak, but screenshot fallback was unavailable.`);
          } else {
            pdfWarnings.push(`${file.name}: no selectable text was found in the PDF.`);
          }
        }
        continue;
      }

      aiFiles.push({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        dataUrl: `data:${file.type};base64,${buffer.toString("base64")}`,
      });
    }

    const parserText = [text, ...extractedPdfText].filter(Boolean).join("\n\n");
    if (sourceType === "pdf" && !parserText.trim() && !aiFiles.length) {
      return NextResponse.json(
        {
          error:
            "This PDF does not contain readable selectable text. Upload the PDF pages as images or paste the text for import.",
        },
        { status: 400 },
      );
    }

    const productContext = await loadProductContext();
    const normalizedAliases = productContext.aliases.map((alias) => ({
      product_id: String(alias.product_id),
      alias: String(alias.alias),
      products: Array.isArray(alias.products) ? (alias.products[0] as Product | undefined) : (alias.products as Product | null),
    }));
    const extractedRows = await parseImportRows({
      sourceType,
      text: parserText,
      files: aiFiles,
      products: productContext.products,
      aliases: normalizedAliases,
    });
    const rows = applyPricing(extractedRows, productContext.products, productContext.pricingRules);

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        source_type: sourceType,
        raw_input: parserText || aiFiles.map((file) => file.name).join(", "),
        status: "review",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (batchError) {
      console.warn("[Import batch save warning]", batchError);
      return NextResponse.json({
        batch_id: null,
        rows,
        warning: [
          productContext.warning,
          "Rows extracted for review, but import batch saving is unavailable until the latest Supabase schema is applied.",
          ...pdfWarnings,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }

    if (rows.length) {
      const { data: savedRows, error: rowsError } = await supabase
        .from("import_rows")
        .insert(
          rows.map((row) => ({
            batch_id: batch.id,
            raw_text: row.raw_text,
            item_name: row.item_name,
            description: row.description,
            qty: row.qty,
            unit: row.unit,
            rate: row.rate,
            amount: row.amount,
            brand: row.brand,
            size: row.size,
            thickness: row.thickness,
            category: row.category,
            confidence: row.confidence,
            matched_product_id: row.matched_product_id,
            approved: row.approved ?? true,
          })),
        )
        .select("id");
      if (rowsError) {
        console.warn("[Import rows save warning]", rowsError);
        return NextResponse.json({
          batch_id: batch.id,
          rows,
          warning: [
            productContext.warning,
            "Rows extracted for review, but saving import rows is unavailable until the latest Supabase schema is applied.",
            ...pdfWarnings,
          ]
            .filter(Boolean)
            .join(" "),
        });
      }
      rows.forEach((row, index) => {
        row.id = savedRows?.[index]?.id;
      });
    }

    return NextResponse.json({
      batch_id: batch.id,
      rows,
      warning: [productContext.warning, ...pdfWarnings].filter(Boolean).join(" "),
    });
  } catch (error) {
    console.error("[Import extraction failed]", error);
    const message = publicImportError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function extractPdfText(buffer: Buffer) {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: buffer });
    const parsedPdf = await parser.getText();
    return normalizePdfText(parsedPdf.text || "");
  } catch (error) {
    console.warn("[PDF text extraction warning]", error);
    return "";
  } finally {
    await parser?.destroy();
  }
}

async function extractPdfScreenshots(buffer: Buffer, fileName: string) {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: buffer });
    const screenshots = await parser.getScreenshot({
      first: 4,
      desiredWidth: 1200,
      imageDataUrl: true,
      imageBuffer: false,
    });

    return screenshots.pages
      .filter((page) => typeof page.dataUrl === "string" && page.dataUrl.startsWith("data:image/"))
      .map((page) => ({
        name: `${fileName} page ${page.pageNumber}.png`,
        mimeType: "image/png",
        dataUrl: page.dataUrl,
      }));
  } catch (error) {
    console.warn("[PDF screenshot fallback warning]", error);
    return [];
  } finally {
    await parser?.destroy();
  }
}

function isUsefulPdfText(value: string) {
  const text = normalizePdfText(value);
  if (text.length < 80) return false;
  const signal = text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "").trim();
  const alphaNumericHits = (signal.match(/[a-z0-9]/gi) ?? []).length;
  const words = signal.split(/\s+/).filter(Boolean);
  return alphaNumericHits >= 40 && words.length >= 12;
}

function normalizePdfText(value: string) {
  return value
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function publicImportError(error: unknown) {
  const message = error instanceof Error ? error.message : "Import extraction failed.";
  const normalized = message.toLowerCase();

  if (normalized.includes("openai_api_key") || normalized.includes("api key")) {
    return "AI import is not configured on the live site. Add OPENAI_API_KEY in deployment environment variables and redeploy.";
  }
  if (normalized.includes("too large") || normalized.includes("maximum") || normalized.includes("413")) {
    return "The upload is too large for online import. Upload fewer/cropped images and try again.";
  }
  if (normalized.includes("rate limit")) {
    return "AI import is temporarily rate-limited. Please wait a minute and try again.";
  }
  if (normalized.includes("no quotation rows") || normalized.includes("no local fallback")) {
    return "No quotation rows could be extracted. Try a clearer/cropped image or paste the text.";
  }

  return message.length > 240 ? `${message.slice(0, 240)}...` : message;
}

function isMissingImportTable(message: string) {
  return (
    message.includes("products") ||
    message.includes("product_aliases") ||
    message.includes("pricing_rules") ||
    message.includes("import_batches") ||
    message.includes("import_rows")
  ) && message.toLowerCase().includes("does not exist");
}
