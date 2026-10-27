insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos-cita',
  'fotos-cita',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Empleados consultan fotos de citas" on storage.objects;
create policy "Empleados consultan fotos de citas"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'fotos-cita'
    and exists (
      select 1
      from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol in ('administrador', 'empleado')
    )
  );

drop policy if exists "Empleados suben fotos de citas" on storage.objects;
create policy "Empleados suben fotos de citas"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'fotos-cita'
    and exists (
      select 1
      from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol in ('administrador', 'empleado')
    )
  );

drop policy if exists "Empleados limpian fotos incompletas" on storage.objects;
create policy "Empleados limpian fotos incompletas"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'fotos-cita'
    and owner_id = (select auth.uid())::text
  );