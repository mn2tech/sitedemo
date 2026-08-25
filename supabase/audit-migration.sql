-- Adds the audits table for the website-review step.
-- Run this in the Supabase SQL editor (safe to run on the existing database).
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_url text not null,
  business_name text,
  report jsonb not null,
  ip_hash text
);

create index if not exists audits_ip_idx on public.audits(ip_hash, created_at desc);

alter table public.audits enable row level security;
-- (no anon policies on purpose — server uses the service-role key)
