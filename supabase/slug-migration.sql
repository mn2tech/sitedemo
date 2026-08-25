-- Pretty URLs: /audit/kendall-capital instead of UUIDs
-- Run in Supabase SQL editor.

alter table public.audits
  add column if not exists slug text;

create unique index if not exists audits_slug_uidx
  on public.audits (slug)
  where slug is not null;
