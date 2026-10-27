alter table public.clientes
  add column if not exists estatura numeric(3, 2),
  add column if not exists peso numeric(5, 2);