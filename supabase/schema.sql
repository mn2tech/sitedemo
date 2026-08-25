-- NM2 SiteDemo schema — run in Supabase SQL editor
create extension if not exists "pgcrypto";

create table public.demos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_url text not null,
  business_name text,
  html text not null,
  ip_hash text
);

create table public.demo_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  demo_id uuid references public.demos(id) on delete set null,
  source_url text,
  name text not null,
  email text not null,
  phone text,
  message text
);

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_url text not null,
  business_name text,
  report jsonb not null,
  ip_hash text
);

create table public.report_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  audit_id uuid references public.audits(id) on delete set null,
  demo_id uuid references public.demos(id) on delete set null,
  source_url text,
  name text,
  email text not null,
  ip_hash text
);

create index demos_ip_idx on public.demos(ip_hash, created_at desc);
create index audits_ip_idx on public.audits(ip_hash, created_at desc);
create index report_sends_ip_idx on public.report_sends(ip_hash, created_at desc);

-- Server uses the service-role key only; lock the tables from anon access.
alter table public.demos enable row level security;
alter table public.demo_leads enable row level security;
alter table public.audits enable row level security;
alter table public.report_sends enable row level security;
-- (no anon policies on purpose)
