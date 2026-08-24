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

**Cuidado con la base:** hoy la única configurada es producción. `migrate dev`,
`db push` y `migrate reset` van contra datos reales.

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
