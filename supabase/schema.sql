create table if not exists public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  email text not null unique,
  rol text not null check (rol in ('administrador', 'empleado')),
  created_at timestamptz not null default now()
);

alter table public.usuarios enable row level security;

drop policy if exists "Cada usuario consulta su propio perfil" on public.usuarios;
create policy "Cada usuario consulta su propio perfil"
  on public.usuarios
  for select
  to authenticated
  using ((select auth.uid()) = id);