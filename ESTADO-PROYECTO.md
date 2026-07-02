# 📊 Estado del Proyecto Eli - Análisis de Producción

> Actualizado tras una revisión de código completa. Este documento reemplaza la versión anterior, que describía un estado muy anterior del proyecto (dashboard con datos mock, backend al 50%) y ya no reflejaba la realidad del código.

## ✅ Lo que ya está resuelto

- **Frontend conectado a APIs reales**: todas las páginas del dashboard (Pacientes, Calendario, Chats, Equipo, Configuración) consumen los endpoints de `/api/*`, no hay datos hardcodeados.
- **Backend con validación**: las 21 rutas de API usan Zod para validar entrada y verifican `session.user.businessId` para aislar los datos por negocio (multi-tenant).
- **Autenticación**: NextAuth.js con credenciales + Google OAuth, middleware que protege `/dashboard` y fuerza completar el perfil de negocio.
- **Modelo de datos completo**: 10 modelos en Prisma (usuarios, negocios, miembros, invitaciones, pacientes, servicios, horarios, citas, conversaciones, mensajes), con 2 migraciones ya generadas.
- **Funcionalidades de negocio**: agendamiento público con validación de disponibilidad, equipo multi-trabajador con invitaciones por email, notificaciones por email (Resend) y recordatorios automáticos vía cron.
- **Calidad de build**: se corrigieron los errores reales de TypeScript que estaban ocultos por `ignoreBuildErrors: true` (ya eliminado de `next.config.mjs`), y se dejó funcionando `eslint.config.mjs` (antes `npm run lint` fallaba de inmediato por falta de configuración). `npx eslint .` y `npx tsc --noEmit` corren limpios.
- **Recuperación de contraseña**: flujo completo — `/recuperar-contrasena` (solicitar enlace) → email con `PasswordResetToken` (expira en 1 hora) → `/restablecer-contrasena/[token]` (definir nueva contraseña). No revela si un email existe o no, para evitar enumeración de usuarios.
- **Tests y CI**: suite de Vitest (`npm test`) cubriendo la generación de slugs, los schemas de validación de Zod (registro, reserva, recuperación de contraseña) y el rate limiter, y un workflow de GitHub Actions (`.github/workflows/ci.yml`) que corre lint, `tsc --noEmit`, tests y build en cada push/PR a `main`.
- **Rate limiting**: `lib/rate-limit.ts` con Upstash Redis (`@upstash/ratelimit`), aplicado a login (`middleware.ts`, sobre `/api/auth/callback/credentials`), registro, recuperar/restablecer contraseña, aceptar invitación de equipo y reserva pública. Si `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` no están configuradas, queda desactivado (fail-open) para no romper el desarrollo local — **falta crear la base en Upstash y cargar esas dos variables en producción para que quede activo de verdad**.

## 🔴 Crítico — pendiente antes de producción

- **Facturación no implementada**: el modal de precios es solo UI (`components/app/modales/provider-precios.tsx`); no hay integración con Stripe ni modelo de suscripción/trial en el schema. Cualquier cuenta registrada usa el producto completo gratis indefinidamente.
- **Rate limiting sin activar en producción**: el código ya está, pero no corre hasta configurar `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (ver `.env.example`).
- **Variables de entorno de producción**: `.env.example` ya incluye todas las requeridas (`GOOGLE_CLIENT_ID/SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`, `UPSTASH_REDIS_REST_URL/TOKEN`); falta configurarlas en el entorno real de despliegue.
- **Migraciones**: correr `npx prisma migrate deploy` (no `migrate dev`) contra la base de datos de producción antes del primer release, incluyendo la migración de `PasswordResetToken`.

## 🟡 Importante

- **Cobertura de tests limitada**: solo cubre funciones puras (slugs, validaciones, rate limiter). Falta cobertura de integración sobre las rutas de API (requiere una base de datos de test) y e2e sobre los flujos críticos (reserva, login, recuperación de contraseña).
- **Sin headers de seguridad** (CSP, X-Frame-Options, etc.) en `next.config.mjs`.
- **Sin monitoreo/logging estructurado** (Sentry o similar) — los errores solo van a `console.error`.
- Creación manual de citas desde el dashboard (`app/api/citas` POST) no valida solapamiento de horarios, a diferencia de la reserva pública que sí lo hace.
- Falta `robots.txt`/`sitemap` para SEO de landing y páginas públicas de reserva.
- Sin `error.tsx`/`not-found.tsx` personalizados (se usan los de Next.js por defecto).

## 🟢 Deseable

- Exportar reportes en PDF, notificaciones push, sincronización con Google Calendar (mencionados en el README como roadmap, no implementados).
- Consolidar la documentación (`README.md`, `GUIA-PROYECTO.md`, `GUIA-CONEXION-BD.md`, `INICIO-RAPIDO.md`) que hoy se solapa parcialmente.

## 🎯 Prioridad para salir a producción

1. Decidir el modelo de monetización real (Stripe + campos de suscripción en el schema) o lanzar sin cobro y agregarlo después.
2. Crear la base de Upstash Redis y cargar `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` para activar el rate limiting ya implementado.
3. Configurar el resto de las variables de entorno y correr `prisma migrate deploy` en el entorno de producción.
4. Ampliar la cobertura de tests a rutas de API críticas y flujos e2e.
