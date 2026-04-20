alter table public.invoices add column if not exists tally_sync_status text not null default 'not_synced';
alter table public.invoices add column if not exists tally_synced_at timestamptz;
alter table public.invoices add column if not exists tally_response text;
alter table public.invoices add column if not exists tally_request_xml text;
