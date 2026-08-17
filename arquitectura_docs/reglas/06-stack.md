# 06 — Stack de ESTE proyecto

## Proyecto

- Producto: **Eli** — sistema de reservas con gestión de comisiones
- Modelo: SaaS multi-tenant (un código, muchos negocios separados por `businessId`)
- Repositorio: `AE-ROD/Eli`
- Rama de trabajo: `v1`

> **No hay `core/` ni `clientes/<slug>/`.** Ver `reglas/01-arquitectura.md`.

## Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Lenguaje | TypeScript | 5 |
| Framework | Next.js (App Router) | 16.2.0 |
| UI | React | 19.2.4 |
| Base de datos | PostgreSQL en Neon | — |
| ORM | Prisma | 6.19 |
| Autenticación | NextAuth (credenciales + Google) | 4.24 |
| Validación | Zod | 3.24 |
| Estilos | Tailwind CSS | 4 |
| Animación | Framer Motion | 12 |
| Tests | Vitest | 3 |
| Correo | Resend | 6.12 |
| Rate limiting | Upstash Redis | 2.0 |
| Hosting | Vercel (incluye el cron de recordatorios) | — |
| Gestor de paquetes | npm | — |

**Cobros:** Stripe **no** está integrado todavía. El modelo definido es suscripción
mensual por negocio (`docs/PRODUCTO.md`).

## Comandos del proyecto

```bash
npm ci                      # instalar
npm run dev                 # levantar en desarrollo
npm test                    # correr tests
npx vitest run lib/x.test.ts  # correr un test puntual
npm run lint                # linter
npx tsc --noEmit            # chequeo de tipos
npm run build               # build
npx prisma generate         # cliente de Prisma tras tocar el esquema
npx prisma validate         # validar el esquema sin tocar la base
npx prisma migrate dev      # nueva migración (sólo en desarrollo)
```

**Antes de cerrar cualquier etapa con código:** `npm run lint`, `npx tsc --noEmit`
y `npm test` en verde.

## Estructura de carpetas real

```
app/                    rutas y páginas (App Router)
  api/                  endpoints — validan con Zod, filtran por businessId
  dashboard/            panel privado
  reservar/[slug]/      página pública de reservas
components/
  landing/              secciones de la web pública
  app/                  interfaz del panel
  ui/                   primitivas (shadcn)
  shared/               compartido entre ambos
lib/                    lógica de negocio, permisos, datos, utilidades
prisma/                 esquema y migraciones
types/                  tipos y declaraciones de módulos
docs/                   producto y requerimientos
arquitectura_docs/      este estándar
```

## Convenciones propias de este proyecto

- **Español en el código**: rutas (`/api/citas`), variables (`nombreNegocio`) y
  comentarios. Los modelos de Prisma están en inglés y mapean a tablas en español
  con `@@map`.
- **Vocabulario único: "Clientes".** Nunca "pacientes", "alumnos" ni "usuarios".
  El producto no habla ningún dialecto de rubro (ver `docs/PRODUCTO.md`).
- **Todo listado lleva `take`.** Sin tope, se degrada con el uso real.
- **Los permisos se preguntan a `lib/permisos.ts`**, nunca con comparaciones de
  rol sueltas en un endpoint.
- **Nada de `session.user as any`.** Los tipos de sesión están declarados en
  `types/next-auth.d.ts`; saltear el tipado en la capa de seguridad es cómo se
  cuelan los errores de permisos.
- **La comisión de una cita completada no se recalcula nunca.** Queda congelada.

## Restricciones del entorno

- **La única base de datos configurada es producción (Neon).** Las operaciones
  destructivas de Prisma están bloqueadas por permisos. No hay entorno de
  desarrollo para probar cambios de esquema.
- **El contenedor de trabajo es efímero.** Se commitea al cerrar cada etapa, no al
  final de la sesión.
- El plan Hobby de Vercel prohíbe uso comercial: al empezar a cobrar hay que pasar
  a Pro o mover el hosting.
