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

create index if not exists delivery_challan_items_delivery_challan_id_idx on public.delivery_challan_items(delivery_challan_id);
create index if not exists delivery_challans_challan_date_idx on public.delivery_challans(challan_date);
create index if not exists delivery_challans_status_idx on public.delivery_challans(status);

alter table public.delivery_challans enable row level security;
alter table public.delivery_challan_items enable row level security;

drop policy if exists "authenticated delivery challans" on public.delivery_challans;
drop policy if exists "authenticated delivery challan items" on public.delivery_challan_items;

create policy "authenticated delivery challans" on public.delivery_challans for all to authenticated using (true) with check (true);
create policy "authenticated delivery challan items" on public.delivery_challan_items for all to authenticated using (true) with check (true);
