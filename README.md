# Estética Integral Melisa Peralta

Aplicación web responsiva para la gestión interna de la estética. La primera entrega incluye autenticación con Supabase, lectura del perfil y acceso diferenciado para administradora y equipo de atención.

## Requisitos

- Node.js 20.19+ o 22.12+
- Un proyecto Supabase

## Desarrollo local

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

En `.env.local`, completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores del proyecto Supabase. Usa la clave publicable/anon, nunca una clave `service_role` en el navegador.

## Configurar perfiles y roles

1. Ejecuta [`supabase/schema.sql`](supabase/schema.sql) desde el SQL Editor de Supabase.
2. Crea cada cuenta en **Authentication > Users**.
3. Inserta su perfil en `public.usuarios` desde el SQL Editor, usando el UUID y correo de esa cuenta. El rol debe ser `administrador` o `empleado`.
4. La política RLS permite que cada usuario autenticado lea solamente su propio perfil. No habilites escrituras públicas en esta tabla.

Ejemplo para dar de alta el perfil de una cuenta ya creada:

```sql
insert into public.usuarios (id, nombre, email, rol)
select id, 'Melisa Peralta', email, 'administrador'
from auth.users
where email = 'melisa@ejemplo.com';
```

## Comandos

- `npm.cmd run dev`: inicia el servidor de desarrollo.
- `npm.cmd run build`: genera la versión de producción.
- `npm.cmd run lint`: ejecuta Oxlint.

La conexión de Supabase requiere credenciales propias; sin ellas, el formulario permanece deshabilitado y muestra el estado de configuración.