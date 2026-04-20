alter table public.quotations add column if not exists ship_to_enabled boolean not null default false;
alter table public.quotations add column if not exists ship_to_name text;
alter table public.quotations add column if not exists ship_to_address text;
alter table public.quotations add column if not exists ship_to_gst_number text;
