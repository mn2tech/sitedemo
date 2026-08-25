-- Report email sends + keep schema docs in sync.
-- Run in Supabase SQL editor (safe on existing DB).

create table if not exists public.report_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  audit_id uuid references public.audits(id) on delete set null,
  demo_id uuid references public.demos(id) on delete set null,
  source_url text,
  name text,
  email text not null,
  ip_hash text
);

create index if not exists report_sends_ip_idx
  on public.report_sends(ip_hash, created_at desc);

alter table public.report_sends enable row level security;
