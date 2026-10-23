-- ============================================================================
-- 056 — upomienky k vydaným faktúram
-- ============================================================================
-- Každá Zahlungserinnerung / Mahnung sa zapíše: ktorý stupeň, kedy, s akou
-- novou lehotou. Podľa toho appka ponúkne ďalší stupeň až po 14 dňoch.
-- Nič sa nemaže — preto tu nie je politika na DELETE.
-- ============================================================================

create table if not exists danubra_invoice_reminders (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.danubra_invoices(id),
  level        smallint not null check (level between 1 and 3),
  sent_at      timestamptz not null default now(),
  deadline     date,
  amount       numeric(12,2),
  channel      text,
  note         text,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);
create index if not exists danubra_invoice_reminders_inv_idx on public.danubra_invoice_reminders (invoice_id, sent_at);

alter table public.danubra_invoice_reminders enable row level security;
create policy danubra_reminders_read on public.danubra_invoice_reminders for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_reminders_insert on public.danubra_invoice_reminders for insert
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
