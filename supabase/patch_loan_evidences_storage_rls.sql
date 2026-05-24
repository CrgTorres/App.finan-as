-- Bucket + políticas RLS para anexos de contrato / evidências.
-- Execute no SQL Editor do Supabase (Dashboard → SQL → New query).
-- Corrige: «new row violates row-level security policy» ao carregar em Storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'loan-evidences',
  'loan-evidences',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/tiff',
    'image/gif'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Caminho na app: {user_id}/{loan_id|sem-vinculo|fingerprint}/{uuid}.ext

drop policy if exists "loan_evidences_storage_select_own" on storage.objects;
create policy "loan_evidences_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'loan-evidences'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "loan_evidences_storage_insert_own" on storage.objects;
create policy "loan_evidences_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'loan-evidences'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "loan_evidences_storage_update_own" on storage.objects;
create policy "loan_evidences_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'loan-evidences'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'loan-evidences'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "loan_evidences_storage_delete_own" on storage.objects;
create policy "loan_evidences_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'loan-evidences'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
