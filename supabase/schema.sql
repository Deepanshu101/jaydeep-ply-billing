create extension if not exists pgcrypto;

create table if not exists public.document_counters (
  doc_type text not null,
  doc_year int not null,
  last_number int not null default 0,
  primary key (doc_type, doc_year)
);

create or replace function public.next_document_number(p_doc_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from current_date);
  next_no int;
  prefix text;
begin
  insert into public.document_counters(doc_type, doc_year, last_number)
  values (p_doc_type, y, 0)
  on conflict (doc_type, doc_year) do nothing;

  update public.document_counters
  set last_number = last_number + 1
  where document_counters.doc_type = p_doc_type
    and doc_year = y
  returning last_number into next_no;

  prefix := case
    when p_doc_type = 'quotation' then 'QTN'
    when p_doc_type = 'invoice' then 'INV'
    when p_doc_type = 'delivery_challan' then 'DC'
    else upper(left(p_doc_type, 3))
  end;
  return prefix || '/' || y || '/' || lpad(next_no::text, 3, '0');
end;
$$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  gst_number text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create unique index if not exists customers_name_unique on public.customers (lower(name));

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text not null unique,
  customer_id uuid not null references public.customers(id),
  client_name text not null,
  project_name text not null,
  address text not null,
  gst_number text default '',
  ship_to_enabled boolean not null default false,
  ship_to_name text,
  ship_to_address text,
  ship_to_gst_number text,
  quote_date date not null default current_date,
  subtotal numeric(12,2) not null default 0,
  discount_type text not null default 'amount' check (discount_type in ('amount', 'percent')),
  discount_value numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  gst_percent numeric(5,2) not null default 18,
  cgst numeric(12,2) not null default 0,
  sgst numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  amount_in_words text not null,
  terms text not null,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'converted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  description text not null,
  specification text default '',
  qty numeric(12,2) not null,
  unit text not null,
  rate numeric(12,2) not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  quotation_id uuid references public.quotations(id),
  customer_id uuid not null references public.customers(id),
  client_name text not null,
  project_name text not null,
  address text not null,
  gst_number text default '',
  invoice_date date not null default current_date,
  subtotal numeric(12,2) not null default 0,
  discount_type text not null default 'amount' check (discount_type in ('amount', 'percent')),
  discount_value numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  gst_percent numeric(5,2) not null default 18,
  cgst numeric(12,2) not null default 0,
  sgst numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  amount_in_words text not null,
  terms text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  specification text default '',
  qty numeric(12,2) not null,
  unit text not null,
  rate numeric(12,2) not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_challans (
  id uuid primary key default gen_random_uuid(),
  challan_no text not null unique,
  quotation_id uuid references public.quotations(id) on delete set null,
  customer_id uuid not null references public.customers(id),
  client_name text not null,
  project_name text not null,
  address text not null,
  gst_number text default '',
  challan_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'ready', 'dispatched', 'delivered', 'cancelled')),
  transporter text,
  vehicle_no text,
  notes text,
  selected_columns jsonb not null default '["description","specification","qty","unit"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_challan_items (
  id uuid primary key default gen_random_uuid(),
  delivery_challan_id uuid not null references public.delivery_challans(id) on delete cascade,
  description text not null,
  specification text default '',
  qty numeric(12,2) not null,
  unit text not null,
  rate numeric(12,2),
  amount numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category text,
  thickness text,
  size text,
  unit text not null default 'Nos',
  base_rate numeric(12,2),
  gst_percent numeric(5,2) not null default 18,
  image_url text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('image', 'pdf', 'text', 'manual')),
  raw_input text,
  status text not null default 'pending' check (status in ('pending', 'review', 'approved', 'failed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  raw_text text,
  item_name text,
  description text,
  qty numeric(12,2),
  unit text,
  rate numeric(12,2),
  amount numeric(12,2),
  brand text,
  size text,
  thickness text,
  category text,
  confidence numeric(5,2),
  matched_product_id uuid references public.products(id) on delete set null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  category text,
  brand text,
  margin_percent numeric(5,2) not null default 15,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_intake (
  id uuid primary key default gen_random_uuid(),
  whatsapp_message_id text,
  from_number text,
  source_type text not null default 'text',
  raw_payload jsonb,
  raw_text text,
  quotation_id uuid references public.quotations(id) on delete set null,
  status text not null default 'received',
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  source text not null default 'manual',
  contact_name text,
  contact_phone text,
  contact_email text,
  project_name text,
  requirement_summary text,
  status text not null default 'new' check (status in ('new', 'boq_received', 'quoted', 'negotiation', 'won', 'lost', 'inactive')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  quotation_id uuid references public.quotations(id) on delete set null,
  stage text not null default 'qualification' check (stage in ('qualification', 'quotation', 'negotiation', 'po_received', 'won', 'lost')),
  probability numeric(5,2) not null default 30,
  expected_value numeric(12,2) not null default 0,
  expected_close_date date,
  margin_alert text,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  quotation_id uuid references public.quotations(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'email', 'call', 'meeting', 'system')),
  direction text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  subject text,
  body text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'failed', 'received')),
  follow_up_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid references public.quotations(id) on delete set null,
  customer_id uuid not null references public.customers(id),
  po_number text,
  po_date date,
  status text not null default 'received' check (status in ('received', 'confirmed', 'part_dispatched', 'completed', 'cancelled')),
  subtotal numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dispatches (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid references public.sales_orders(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  dispatch_date date,
  status text not null default 'pending' check (status in ('pending', 'ready', 'dispatched', 'delivered')),
  transporter text,
  vehicle_no text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  amount numeric(12,2) not null,
  payment_date date not null default current_date,
  mode text,
  reference_no text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_followups (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  due_date date,
  promised_date date,
  status text not null default 'pending' check (status in ('pending', 'promised', 'paid', 'escalated')),
  risk_score int not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tally_sync_runs (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null default 'full',
  from_date date not null,
  to_date date not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  clients_imported int not null default 0,
  products_imported int not null default 0,
  rates_imported int not null default 0,
  error text,
  raw_summary jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.product_rate_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  source text not null default 'tally',
  voucher_no text,
  voucher_date date,
  party_name text,
  item_name text not null,
  qty numeric(12,2),
  unit text,
  rate numeric(12,2),
  amount numeric(12,2),
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.customers add column if not exists payment_terms_days int not null default 30;
alter table public.customers add column if not exists preferred_brands text[] not null default '{}';
alter table public.customers add column if not exists price_sensitivity text not null default 'unknown';
alter table public.customers add column if not exists risk_level text not null default 'unknown';
alter table public.quotations add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.quotations add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null;
alter table public.quotations add column if not exists revision_no int not null default 0;
alter table public.quotations add column if not exists sent_at timestamptz;
alter table public.quotations add column if not exists expected_margin_percent numeric(5,2);
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists ship_to_enabled boolean not null default false;
alter table public.invoices add column if not exists ship_to_name text;
alter table public.invoices add column if not exists ship_to_address text;
alter table public.invoices add column if not exists ship_to_gst_number text;
alter table public.invoices add column if not exists dispatch_doc_no text;
alter table public.invoices add column if not exists dispatch_date date;
alter table public.invoices add column if not exists dispatched_through text;
alter table public.invoices add column if not exists destination text;
alter table public.invoices add column if not exists carrier_name text;
alter table public.invoices add column if not exists bill_lading_no text;
alter table public.invoices add column if not exists vehicle_no text;
alter table public.invoices add column if not exists order_no text;
alter table public.invoices add column if not exists order_date date;
alter table public.invoices add column if not exists payment_terms text;
alter table public.invoices add column if not exists other_references text;
alter table public.invoices add column if not exists terms_of_delivery text;
alter table public.invoices add column if not exists paid_amount numeric(12,2) not null default 0;
alter table public.quotations add column if not exists discount_type text not null default 'amount';
alter table public.quotations add column if not exists discount_value numeric(12,2) not null default 0;
alter table public.quotations add column if not exists discount_amount numeric(12,2) not null default 0;
alter table public.quotations add column if not exists ship_to_enabled boolean not null default false;
alter table public.quotations add column if not exists ship_to_name text;
alter table public.quotations add column if not exists ship_to_address text;
alter table public.quotations add column if not exists ship_to_gst_number text;
alter table public.invoices add column if not exists discount_type text not null default 'amount';
alter table public.invoices add column if not exists discount_value numeric(12,2) not null default 0;
alter table public.invoices add column if not exists discount_amount numeric(12,2) not null default 0;

alter table public.invoices add column if not exists tally_sync_status text not null default 'not_synced';
alter table public.invoices add column if not exists tally_synced_at timestamptz;
alter table public.invoices add column if not exists tally_response text;
alter table public.invoices add column if not exists tally_request_xml text;

create or replace function public.set_quotation_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quotation_no is null or new.quotation_no = '' then
    new.quotation_no := public.next_document_number('quotation');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_invoice_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invoice_no is null or new.invoice_no = '' then
    new.invoice_no := public.next_document_number('invoice');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_delivery_challan_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.challan_no is null or new.challan_no = '' then
    new.challan_no := public.next_document_number('delivery_challan');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists quotations_number_trigger on public.quotations;
create trigger quotations_number_trigger
before insert or update on public.quotations
for each row execute function public.set_quotation_no();

drop trigger if exists invoices_number_trigger on public.invoices;
create trigger invoices_number_trigger
before insert or update on public.invoices
for each row execute function public.set_invoice_no();

drop trigger if exists delivery_challans_number_trigger on public.delivery_challans;
create trigger delivery_challans_number_trigger
before insert or update on public.delivery_challans
for each row execute function public.set_delivery_challan_no();

create index if not exists quotation_items_quotation_id_idx on public.quotation_items(quotation_id);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items(invoice_id);
create index if not exists delivery_challan_items_delivery_challan_id_idx on public.delivery_challan_items(delivery_challan_id);
create index if not exists delivery_challans_challan_date_idx on public.delivery_challans(challan_date);
create index if not exists delivery_challans_status_idx on public.delivery_challans(status);
create index if not exists delivery_challans_customer_id_idx on public.delivery_challans(customer_id);
create index if not exists delivery_challans_quotation_id_idx on public.delivery_challans(quotation_id);
create index if not exists quotations_status_idx on public.quotations(status);
create index if not exists quotations_customer_id_idx on public.quotations(customer_id);
create index if not exists quotations_lead_id_idx on public.quotations(lead_id);
create index if not exists quotations_opportunity_id_idx on public.quotations(opportunity_id);
create index if not exists invoices_invoice_date_idx on public.invoices(invoice_date);
create index if not exists invoices_customer_id_idx on public.invoices(customer_id);
create index if not exists invoices_quotation_id_idx on public.invoices(quotation_id);
create index if not exists products_search_idx on public.products using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(category, '') || ' ' || coalesce(size, '') || ' ' || coalesce(thickness, '')));
create unique index if not exists product_alias_unique_idx on public.product_aliases(product_id, alias);
create index if not exists product_aliases_alias_idx on public.product_aliases(alias);
create index if not exists import_batches_created_by_idx on public.import_batches(created_by);
create index if not exists import_rows_batch_id_idx on public.import_rows(batch_id);
create index if not exists import_rows_matched_product_id_idx on public.import_rows(matched_product_id);
create index if not exists pricing_rules_product_id_idx on public.pricing_rules(product_id);
create index if not exists whatsapp_intake_message_id_idx on public.whatsapp_intake(whatsapp_message_id);
create index if not exists whatsapp_intake_quotation_id_idx on public.whatsapp_intake(quotation_id);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_next_follow_up_idx on public.leads(next_follow_up_at);
create index if not exists leads_customer_id_idx on public.leads(customer_id);
create index if not exists opportunities_stage_idx on public.opportunities(stage);
create index if not exists opportunities_lead_id_idx on public.opportunities(lead_id);
create index if not exists opportunities_customer_id_idx on public.opportunities(customer_id);
create index if not exists opportunities_quotation_id_idx on public.opportunities(quotation_id);
create index if not exists communication_logs_follow_up_idx on public.communication_logs(follow_up_at);
create index if not exists communication_logs_customer_id_idx on public.communication_logs(customer_id);
create index if not exists communication_logs_quotation_id_idx on public.communication_logs(quotation_id);
create index if not exists communication_logs_invoice_id_idx on public.communication_logs(invoice_id);
create index if not exists sales_orders_status_idx on public.sales_orders(status);
create index if not exists sales_orders_customer_id_idx on public.sales_orders(customer_id);
create index if not exists sales_orders_quotation_id_idx on public.sales_orders(quotation_id);
create index if not exists dispatches_status_idx on public.dispatches(status);
create index if not exists dispatches_sales_order_id_idx on public.dispatches(sales_order_id);
create index if not exists dispatches_invoice_id_idx on public.dispatches(invoice_id);
create index if not exists payments_invoice_id_idx on public.payments(invoice_id);
create index if not exists payments_customer_id_idx on public.payments(customer_id);
create index if not exists payment_followups_status_idx on public.payment_followups(status);
create index if not exists payment_followups_invoice_id_idx on public.payment_followups(invoice_id);
create index if not exists payment_followups_customer_id_idx on public.payment_followups(customer_id);
create index if not exists tally_sync_runs_created_at_idx on public.tally_sync_runs(created_at);
create index if not exists product_rate_history_product_id_idx on public.product_rate_history(product_id);
create index if not exists product_rate_history_customer_id_idx on public.product_rate_history(customer_id);
create index if not exists product_rate_history_voucher_date_idx on public.product_rate_history(voucher_date);

alter table public.document_counters enable row level security;
alter table public.customers enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.delivery_challans enable row level security;
alter table public.delivery_challan_items enable row level security;
alter table public.products enable row level security;
alter table public.product_aliases enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.whatsapp_intake enable row level security;
alter table public.leads enable row level security;
alter table public.opportunities enable row level security;
alter table public.communication_logs enable row level security;
alter table public.sales_orders enable row level security;
alter table public.dispatches enable row level security;
alter table public.payments enable row level security;
alter table public.payment_followups enable row level security;
alter table public.tally_sync_runs enable row level security;
alter table public.product_rate_history enable row level security;

drop policy if exists "authenticated customers" on public.customers;
drop policy if exists "authenticated quotations" on public.quotations;
drop policy if exists "authenticated quotation items" on public.quotation_items;
drop policy if exists "authenticated invoices" on public.invoices;
drop policy if exists "authenticated invoice items" on public.invoice_items;
drop policy if exists "authenticated delivery challans" on public.delivery_challans;
drop policy if exists "authenticated delivery challan items" on public.delivery_challan_items;
drop policy if exists "authenticated products" on public.products;
drop policy if exists "authenticated product aliases" on public.product_aliases;
drop policy if exists "authenticated import batches" on public.import_batches;
drop policy if exists "authenticated import rows" on public.import_rows;
drop policy if exists "authenticated pricing rules" on public.pricing_rules;
drop policy if exists "authenticated whatsapp intake" on public.whatsapp_intake;
drop policy if exists "authenticated leads" on public.leads;
drop policy if exists "authenticated opportunities" on public.opportunities;
drop policy if exists "authenticated communication logs" on public.communication_logs;
drop policy if exists "authenticated sales orders" on public.sales_orders;
drop policy if exists "authenticated dispatches" on public.dispatches;
drop policy if exists "authenticated payments" on public.payments;
drop policy if exists "authenticated payment followups" on public.payment_followups;
drop policy if exists "authenticated tally sync runs" on public.tally_sync_runs;
drop policy if exists "authenticated product rate history" on public.product_rate_history;
drop policy if exists "service role document counters" on public.document_counters;

create policy "service role document counters" on public.document_counters for all to service_role using (true) with check (true);
create policy "authenticated customers" on public.customers for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated quotations" on public.quotations for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated quotation items" on public.quotation_items for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated invoices" on public.invoices for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated invoice items" on public.invoice_items for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delivery challans" on public.delivery_challans for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delivery challan items" on public.delivery_challan_items for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated products" on public.products for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated product aliases" on public.product_aliases for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated import batches" on public.import_batches for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated import rows" on public.import_rows for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated pricing rules" on public.pricing_rules for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated whatsapp intake" on public.whatsapp_intake for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated leads" on public.leads for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated opportunities" on public.opportunities for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated communication logs" on public.communication_logs for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated sales orders" on public.sales_orders for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated dispatches" on public.dispatches for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated payments" on public.payments for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated payment followups" on public.payment_followups for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated tally sync runs" on public.tally_sync_runs for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated product rate history" on public.product_rate_history for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

revoke execute on function public.next_document_number(text) from public;
revoke execute on function public.next_document_number(text) from anon;
revoke execute on function public.next_document_number(text) from authenticated;
grant execute on function public.next_document_number(text) to authenticated;
grant execute on function public.next_document_number(text) to service_role;
