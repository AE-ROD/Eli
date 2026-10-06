# Eli

Sistema de reservas para **salones de belleza, barberías y spas de uñas**. Cada
negocio tiene su agenda, su equipo y su página pública de reserva; los
profesionales cobran un porcentaje del servicio que atienden.

Qué es, para quién y qué falta decidir: `docs/PRODUCTO.md`.

## Levantarlo

```bash
npm ci                 # instala exactamente lo que fija package-lock.json
npx prisma generate    # genera el cliente de la base
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

Si movés o renombrás una ruta, corré `npx next typegen` antes de `tsc`: los
tipos de las rutas viven en `.next/types` y quedan viejos hasta el próximo build.

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

## Cómo está organizado

```
app/                          Pantallas y endpoints (App Router de Next.js)
  (acceso)/                   Entrar, crear cuenta, completar perfil, recuperar
                              contraseña y unirse a un equipo. Los paréntesis
                              agrupan sin cambiar la URL.
  dashboard/                  El panel del negocio
    page.tsx                  Inicio del panel
    agenda/  clientes/  chats/  configuracion/  equipo/
  reservar/[slug]/            Página pública donde el cliente final reserva
  api/                        Endpoints: cada carpeta es una URL bajo /api
components/
  comunes/                    Lo que usan varias zonas: botón, campo de formulario, logo
  panel/                      Estructura del panel: barras, avatar, tarjeta de cita, modales
  landing/                    Secciones de la página de inicio
  ui/                         Primitivas de shadcn (conservan sus nombres en inglés)
  proveedores.tsx             Sesión de NextAuth para toda la app
lib/                          Lógica compartida, cada archivo con su test al lado
  permisos.ts                 Quién puede ver y hacer qué. Toda consulta pasa por acá
  auth.ts                     Sesiones: credenciales y Google
  prisma.ts                   Conexión a la base
  peticiones.ts               Cómo la interfaz le pide cosas al servidor
  fechas.ts                   Cálculos y formatos de fecha
  horario-dia.ts              La jornada de un profesional: citas y huecos del día
  rubros.ts                   Los tres rubros que atiende Eli
  validaciones.ts             Lo que aceptan los endpoints (zod)
  email.ts                    Correos (Resend)
  rate-limit.ts               Límite de peticiones (Upstash)
  slug.ts                     La dirección pública de cada negocio
  utils.ts                    `cn`, para combinar clases de Tailwind
prisma/                       Esquema, migraciones y datos de ejemplo
proxy.ts                      Puerta de entrada: sesión y límite de peticiones
types/                        Tipos que extienden librerías (la sesión de NextAuth)
docs/                         Producto (PRODUCTO.md) y diseño de la landing (diseno/)
```

Cada vista del panel se arma igual:

```
<vista>/page.tsx              Sólo compone: estado, llamadas y componentes
<vista>/_datos.ts             Todo lo que la vista le pide al servidor. Devuelve
                              { ok } en vez de lanzar, y la pantalla no conoce URLs
<vista>/_componentes/         Las piezas que sólo usa esa vista
```

## Convenciones

- **Idioma.** El dominio se nombra en español: `cliente`, `cita`, `agenda`. El
  inglés queda sólo donde lo impone una herramienta:
  - los archivos especiales de Next (`page.tsx`, `layout.tsx`, `route.ts`,
    `proxy.ts`);
  - las primitivas de shadcn;
  - el esquema de Prisma, cuyos modelos y columnas ya existen en producción.
- **Archivos y carpetas** en kebab-case: `modal-nueva-cita.tsx`.
- **Componentes** en PascalCase y en español: `ModalNuevaCita`. La página de
  cada ruta se exporta como `Pagina<Nombre>`.
- **Dónde va cada cosa:**
  - lo que usa una sola vista vive en su `_componentes/`;
  - lo que usan varias, en `components/`;
  - la lógica sin pantalla, en `lib/`, con su test al lado.
- **Nombres que dicen qué contienen**, con palabras completas: `respuesta`, no
  `res`; `servicio`, no `s`.

## Decisiones técnicas que no se tocan sin pensarlo

- **El esquema de Prisma y sus migraciones ya están aplicados en producción
  (Neon).** Para renombrar un modelo o un campo se usa `@map`: así se pasó de
  `Patient` a `Customer` sin tocar la base. Cambiar una columna de verdad pide
  una migración sobre datos reales.
- **NextAuth sigue en v4.** Auth.js v5 existe, pero migrar rompe lo que funciona
  sin aportar valor.
- **Vercel Hobby prohíbe el uso comercial.** Antes de cobrar hay que pasar a Pro
  o mover el despliegue.
- **Resend:** falta verificar el dominio (SPF/DKIM) o los correos caen en spam.
- **Pagos online:** Stripe no está integrado y los precios todavía no están
  definidos.

## Cómo se trabaja acá

Lee `CLAUDE.md`: es el contrato de trabajo. En resumen:

- el alcance de cada tarea se acuerda antes de escribir código;
- los permisos se preguntan siempre a `lib/permisos.ts`, nunca comparando roles
  a mano.
