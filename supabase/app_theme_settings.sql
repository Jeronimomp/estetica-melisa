create table if not exists public.configuracion_app (
  clave text primary key check (clave = 'tema_visual'),
  valor text not null check (valor in ('verde', 'grafito', 'oliva', 'malva')),
  actualizado_por uuid references public.usuarios (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.configuracion_app (clave, valor)
values ('tema_visual', 'verde')
on conflict (clave) do nothing;

alter table public.configuracion_app enable row level security;

drop policy if exists "Usuarios autenticados consultan configuracion visual" on public.configuracion_app;
create policy "Usuarios autenticados consultan configuracion visual"
  on public.configuracion_app
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Administradores actualizan configuracion visual" on public.configuracion_app;
create policy "Administradores actualizan configuracion visual"
  on public.configuracion_app
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

grant select, update on public.configuracion_app to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'configuracion_app'
    ) then
    alter publication supabase_realtime add table public.configuracion_app;
  end if;
end
$$;