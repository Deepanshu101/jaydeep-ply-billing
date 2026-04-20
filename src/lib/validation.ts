import { z } from "zod";

export const lineItemSchema = z.object({
  description: z.string().min(1),
  specification: z.string().default(""),
  qty: z.coerce.number().positive(),
  unit: z.string().min(1),
  rate: z.coerce.number().nonnegative(),
  amount: z.coerce.number().nonnegative().optional(),
});

export const quotationSchema = z.object({
  client_name: z.string().min(1),
  project_name: z.string().min(1),
  address: z.string().min(1),
  gst_number: z.string().default(""),
  ship_to_enabled: z.coerce.boolean().default(false),
  ship_to_name: z.string().default(""),
  ship_to_address: z.string().default(""),
  ship_to_gst_number: z.string().default(""),
  quote_date: z.string().min(1),
  gst_percent: z.coerce.number().min(0).max(100),
  discount_type: z.enum(["amount", "percent"]).default("amount"),
  discount_value: z.coerce.number().min(0).default(0),
  terms: z.string().min(1),
  items: z.array(lineItemSchema).min(1),
});

export const invoiceSchema = z.object({
  client_name: z.string().min(1),
  project_name: z.string().min(1),
  address: z.string().min(1),
  gst_number: z.string().default(""),
  invoice_date: z.string().min(1),
  due_date: z.string().default(""),
  gst_percent: z.coerce.number().min(0).max(100),
  discount_type: z.enum(["amount", "percent"]).default("amount"),
  discount_value: z.coerce.number().min(0).default(0),
  terms: z.string().min(1),
  items: z.array(lineItemSchema).min(1),
});

export const importRowSchema = z.object({
  id: z.string().uuid().optional(),
  item_name: z.string().default(""),
  description: z.string().default(""),
  qty: z.coerce.number().nullable().default(null),
  unit: z.string().nullable().default(null),
  rate: z.coerce.number().nullable().default(null),
  amount: z.coerce.number().nullable().default(null),
  brand: z.string().nullable().default(null),
  size: z.string().nullable().default(null),
  thickness: z.string().nullable().default(null),
  category: z.string().nullable().default(null),
  confidence: z.coerce.number().nullable().default(null),
  raw_text: z.string().nullable().default(null),
  matched_product_id: z.string().uuid().nullable().optional(),
  matched_product_name: z.string().nullable().optional(),
  matched_product_unit: z.string().nullable().optional(),
  matched_product_rate: z.coerce.number().nullable().optional(),
  matched_product_brand: z.string().nullable().optional(),
  matched_product_size: z.string().nullable().optional(),
  matched_product_thickness: z.string().nullable().optional(),
  matched_product_category: z.string().nullable().optional(),
  save_to_product: z.boolean().optional(),
  approved: z.boolean().optional(),
  image_url: z.string().nullable().optional(),
});

export const importRowsSchema = z.array(importRowSchema);

export const createImportQuotationSchema = z.object({
  client_name: z.string().min(1),
  project_name: z.string().min(1),
  address: z.string().min(1),
  gst_number: z.string().default(""),
  quote_date: z.string().min(1),
  gst_percent: z.coerce.number().min(0).max(100),
  discount_type: z.enum(["amount", "percent"]).default("amount"),
  discount_value: z.coerce.number().min(0).default(0),
  terms: z.string().min(1),
  rows: importRowsSchema.min(1),
});
