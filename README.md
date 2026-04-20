# Jaydeep Ply Billing

A production-oriented quotation and billing web app for Jaydeep Ply, built with Next.js, TypeScript, Tailwind, Node.js route handlers, Supabase, email/password login, PDF export, and TallyPrime XML export.

## Features

- Email/password login, signup, magic-link backup, and password reset
- Dashboard for quotation count, invoice count, pending approvals, and monthly sales
- Customers, quotations, quotation items, invoices, and invoice items
- Quotation numbers in `QTN/YYYY/NNN` format
- GST calculation with CGST and SGST split
- Amount in words for Indian Rupees
- Jaydeep Ply branded quotation PDF
- Quotation edit, duplicate, approval, and convert-to-invoice actions
- AI Import Desk for images, PDFs, pasted text, and backup manual rows
- Editable extraction review table with product matching and product-master save
- WhatsApp webhook intake for BOQ text, images, and documents
- Auto pricing with product base rates and margin rules
- Invoice detail screen with TallyPrime XML export
- Direct Tally push over HTTP when Tally is reachable from the server
- Responsive UI for desktop and mobile

## Folder Structure

```txt
src/app
  api/                 Node.js route handlers for PDF and XML exports
  auth/                Supabase auth callback and sign out
  dashboard/           KPI dashboard
  import/              AI Import Desk
  invoices/            Invoice list and detail pages
  login/               Email login page
  quotations/          Quotation list, create, and edit pages
src/components         Reusable UI and quotation form
src/lib                Supabase clients, calculations, import parser, PDF, Tally XML, types
supabase/schema.sql    Database schema, triggers, indexes, and RLS policies
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your Supabase project values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-for-server-webhooks
NEXT_PUBLIC_SITE_URL=http://localhost:3000
OPENAI_API_KEY=your-openai-api-key
OPENAI_IMPORT_MODEL=gpt-4.1-mini
OPENAI_IMPORT_MAX_OUTPUT_TOKENS=6000
DEFAULT_IMPORT_MARGIN_PERCENT=15
WHATSAPP_VERIFY_TOKEN=choose-a-random-verify-token
WHATSAPP_ACCESS_TOKEN=meta-whatsapp-cloud-api-token
TALLY_HTTP_URL=http://localhost:9000
TALLY_COMPANY_NAME=Your Tally Company
```

In Supabase Auth, enable the Email provider, turn on email/password sign-in, and add `http://localhost:3000/auth/callback` to the redirect URLs. Magic link login remains available as a backup, and password reset emails should use the same callback URL.

## Database Setup

Open the Supabase SQL editor and run:

```sql
-- paste the contents of supabase/schema.sql
```

The schema creates document counters, customers, quotations, quotation items, invoices, invoice items, number triggers, indexes, and authenticated-user RLS policies.

It also creates the Import Desk tables:

- `products`
- `product_aliases`
- `import_batches`
- `import_rows`
- `pricing_rules`
- `whatsapp_intake`

It also adds Tally sync status fields to `invoices`.

## Import Desk

Open `/import` after signing in. The workflow is upload first, extract first, review first:

1. Upload multiple images, upload a PDF, paste text, or add a manual backup row.
2. Click `Extract rows`.
3. Review and edit the extracted table.
4. Save selected rows to the product master, create a quotation from approved rows, or both.

The parser is modular in `src/lib/import/parser.ts`. It first tries to reuse `products` and `product_aliases` from the database for text/PDF imports, which reduces AI usage for known products. If AI is needed and `OPENAI_API_KEY` is set, it calls the OpenAI Responses API with a strict JSON schema and the configured output-token cap. If the key is missing, it uses a simple local fallback parser so the UI can still be tested.

Images are compressed in the browser before upload. Selectable PDF text is extracted server-side and chunked, so text PDFs do not need to be sent as full files to AI.

## WhatsApp Intake

Configure Meta WhatsApp Cloud API webhook verification with:

```txt
https://your-domain.com/api/whatsapp/webhook
```

Use `WHATSAPP_VERIFY_TOKEN` as the verify token. Incoming text/media messages are stored in `whatsapp_intake`, extracted through the same import parser, priced with product/margin rules, and converted into a draft quotation named `WhatsApp BOQ Import`.

For media download, set `WHATSAPP_ACCESS_TOKEN`. The webhook uses `SUPABASE_SERVICE_ROLE_KEY` because Meta calls it without a browser login session.

## Pricing

Pricing is applied before quotation draft creation:

- Product `base_rate` is reused when available.
- Active `pricing_rules` can match by product, category, or brand.
- `DEFAULT_IMPORT_MARGIN_PERCENT` is used when no rule matches.

## Direct Tally Push

The invoice screen includes `Push to Tally`. It posts the invoice XML directly to `TALLY_HTTP_URL`.

For local TallyPrime, the Next.js server must run on the same machine or network that can reach Tally's HTTP port, commonly `http://localhost:9000`. If the app is deployed to the cloud, a local connector, VPN, or tunnel is required because cloud servers cannot reach your office `localhost`.

## Run Locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Production Build

```bash
npm run build
npm run start
```

## Export Routes

- Quotation PDF: `/api/quotations/:id/pdf`
- TallyPrime XML: `/api/invoices/:id/tally`
- Direct Tally push: `/api/invoices/:id/tally/push`
- Import extraction: `/api/import/extract`
- WhatsApp webhook: `/api/whatsapp/webhook`
