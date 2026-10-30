alter table public.citas
  add column if not exists oculto_en_expediente_at timestamptz,
  add column if not exists oculto_en_expediente_por uuid;

alter table public.tratamientos
  add column if not exists oculto_en_expediente_at timestamptz,
  add column if not exists oculto_en_expediente_por uuid;

grant update (oculto_en_expediente_at, oculto_en_expediente_por)
  on table public.citas, public.tratamientos
  to authenticated;

drop policy if exists "Administradores ocultan citas del expediente" on public.citas;
create policy "Administradores ocultan citas del expediente"
  on public.citas
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'administrador'
    )
  )
  with check (
    exists (
      select 1
      from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'administrador'
    )
  );

drop policy if exists "Administradores ocultan tratamientos del expediente" on public.tratamientos;
create policy "Administradores ocultan tratamientos del expediente"
  on public.tratamientos
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'administrador'
    )
  )
  with check (
    exists (
      select 1
      from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'administrador'
    )
  );