drop policy if exists "empleados_eliminan_clientes" on public.clientes;

create policy "empleados_eliminan_clientes"
  on public.clientes
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol in ('administrador', 'empleado')
    )
  );

grant delete on public.clientes to authenticated;