alter table public.quotations add column if not exists discount_type text not null default 'amount';
alter table public.quotations add column if not exists discount_value numeric(12,2) not null default 0;
alter table public.quotations add column if not exists discount_amount numeric(12,2) not null default 0;

alter table public.invoices add column if not exists discount_type text not null default 'amount';
alter table public.invoices add column if not exists discount_value numeric(12,2) not null default 0;
alter table public.invoices add column if not exists discount_amount numeric(12,2) not null default 0;
