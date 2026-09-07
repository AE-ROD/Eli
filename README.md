# Eli

Sistema de reservas para negocios que atienden con cita. Cada negocio tiene su
agenda, su equipo y su página pública de reserva; los profesionales cobran un
porcentaje del servicio que atienden.

Qué es y para quién, en `docs/PRODUCTO.md`.

## Levantarlo

```bash
npm install
npx prisma generate
npm run dev
```

Necesita un `.env` con:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Postgres (Neon), conexión con pool. |
| `DIRECT_URL` | Postgres directo. Sólo lo usan las migraciones. |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | Sesiones. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Entrar con Google. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Correos. Sin esto no se envían, pero nada se rompe. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting. Sin esto queda desactivado. |
| `CRON_SECRET` | Protege el cron de recordatorios. |

## Comandos

```bash
npm run dev            # desarrollo
npm run build          # build de producción
npm run lint           # eslint
npm test               # vitest
npx tsc --noEmit       # chequeo de tipos
npx prisma studio      # ver la base
```

## Una base de desarrollo, para no tocar producción

`DATABASE_URL` apunta a Neon, que es **producción**: `migrate dev`, `db push` y
`migrate reset` van contra datos reales. Para trabajar tranquilo, levantá una
base local y apuntá el `.env` ahí.

Con Postgres instalado:

```bash
initdb -D ~/eli-pg -A trust -U postgres
pg_ctl -D ~/eli-pg -o '-p 5433' start
createdb -h localhost -p 5433 -U postgres eli
```

Aplicá las migraciones con `psql` en vez de con Prisma, para no arriesgarte a
que un comando salga apuntando a Neon:

```bash
for f in prisma/migrations/*/migration.sql; do
  psql -h localhost -p 5433 -U postgres -d eli -v ON_ERROR_STOP=1 -f "$f"
done
```

En el `.env`, `DATABASE_URL` y `DIRECT_URL` pasan a
`postgresql://postgres@localhost:5433/eli?schema=public`. Después:

```bash
SEED_CONFIRMO=si npm run prisma:seed
```

Quedan un negocio de ejemplo y tres cuentas —`duena@demo.eli`,
`encargado@demo.eli`, `profesional@demo.eli`, contraseña `demo1234`— una por
rol, que es la forma corta de ver qué cambia con cada uno.

## Cómo se trabaja acá

Lee `CLAUDE.md`: es el contrato de trabajo. En resumen, toda tarea nace de una
ficha en `arquitectura_docs/features/`, y los permisos se preguntan siempre a
`lib/permisos.ts`, nunca comparando roles a mano.

```
app/                 rutas y endpoints (App Router)
components/          UI compartida
lib/                 permisos, auth, prisma, correo, rate limit, validaciones
prisma/              esquema y migraciones
arquitectura_docs/   reglas de trabajo y fichas de feature
docs/                producto y requerimientos
```
