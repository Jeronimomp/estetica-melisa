grant update on table public.fotos_cita to authenticated;

drop policy if exists "Empleados actualizan fotos de citas" on public.fotos_cita;
create policy "Empleados actualizan fotos de citas"
  on public.fotos_cita
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol in ('administrador', 'empleado')
    )
  )
  with check (
    exists (
      select 1
      from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol in ('administrador', 'empleado')
    )
  );