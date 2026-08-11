-- ============================================================================
-- DANUBRA Hub — 008 — zachytenie hovoru: vlastné úložisko nahrávok
-- ============================================================================
-- Doteraz vedel systém spracovať len nahrávku, ktorá už niekde ležala na URL.
-- Toto dopĺňa chýbajúci kus reťazca — kam sa zvuk fyzicky uloží:
--
--   privátny bucket `danubra-calls` v Supabase Storage
--     ← nahratý súbor z mobilu (záznamník hovorov, WhatsApp export)
--     ← priama nahrávka z prehliadača (hlasitý odposluch, osobný pohovor)
--     ← webhook od VoIP operátora (ak sa neskôr pridá)
--
-- Bucket je privátny. Nahrávka sa nikdy nesprístupní verejnou URL — funkcia
-- si ju stiahne cez service-role podpísaný odkaz, ktorý platí pár minút.
-- Dôvod je rovnaký ako pri súhlase: nahrávka hovoru je citlivý osobný údaj.
--
-- Idempotentné.
-- ============================================================================

-- ── Kde nahrávka leží ───────────────────────────────────────────────────────
alter table danubra_call_recordings add column if not exists audio_path text;
alter table danubra_call_recordings add column if not exists audio_mime text;
alter table danubra_call_recordings add column if not exists audio_bytes bigint;
-- odkiaľ zvuk prišiel: 'upload' | 'browser' | 'url' | 'voip'
alter table danubra_call_recordings add column if not exists source text default 'url';
-- smer hovoru pre prehľad: 'in' | 'out'
alter table danubra_call_recordings add column if not exists direction text;

comment on column danubra_call_recordings.audio_path is
  'Cesta v privátnom buckete danubra-calls. Má prednosť pred audio_url.';

-- ── Privátny bucket ─────────────────────────────────────────────────────────
-- V Supabase SQL editore to prejde; ak nie, bucket sa dá založiť ručne
-- v Storage → New bucket → názov danubra-calls, Public = vypnuté.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('danubra-calls', 'danubra-calls', false, 209715200,
          array['audio/mpeg','audio/mp4','audio/m4a','audio/x-m4a','audio/aac',
                'audio/ogg','audio/opus','audio/wav','audio/x-wav','audio/webm',
                'audio/flac','audio/amr','video/mp4','video/webm'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception when insufficient_privilege then
  raise notice 'Bucket danubra-calls sa nedá založiť cez SQL — vytvor ho ručne v Storage (Public vypnuté).';
end $$;

-- ── Kto sa k nahrávkam dostane ──────────────────────────────────────────────
-- Len prihlásený používateľ aplikácie. Anonymné čítanie neexistuje.
do $$
begin
  drop policy if exists danubra_calls_read on storage.objects;
  drop policy if exists danubra_calls_write on storage.objects;
  drop policy if exists danubra_calls_update on storage.objects;
  drop policy if exists danubra_calls_delete on storage.objects;

  create policy danubra_calls_read on storage.objects
    for select using (bucket_id = 'danubra-calls' and auth.role() = 'authenticated');
  create policy danubra_calls_write on storage.objects
    for insert with check (bucket_id = 'danubra-calls' and auth.role() = 'authenticated');
  create policy danubra_calls_update on storage.objects
    for update using (bucket_id = 'danubra-calls' and auth.role() = 'authenticated');
  create policy danubra_calls_delete on storage.objects
    for delete using (bucket_id = 'danubra-calls' and auth.role() = 'authenticated');
exception when insufficient_privilege then
  raise notice 'Politiky na storage.objects sa nedajú vytvoriť cez SQL — nastav ich v Storage → Policies.';
end $$;

-- ── Existujúce riadky ───────────────────────────────────────────────────────
update danubra_call_recordings set source = 'url' where source is null;

-- Diagnostika
select 'recordings' t, count(*) from danubra_call_recordings
union all select 'bucket danubra-calls', count(*) from storage.buckets where id = 'danubra-calls';
