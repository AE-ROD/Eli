---
id: F-010
titulo: El rate limit falla abierto
estado: en-progreso
prioridad: alta
areas: [backend]
rama: v1
estimacion: chica
max_iteraciones: 3
---

# F-010 — El rate limit falla abierto

## Problema

Lo marcó el `revisor` en F-004. `lib/rate-limit.ts` **deja pasar todo** cuando
faltan las credenciales de Upstash, y hay un test que consagra ese
comportamiento como correcto.

Contradice la regla 1 del proyecto —los controles fallan cerrados— y el modo de
falla es silencioso: si mañana la variable de entorno desaparece de Vercel por
un despliegue mal hecho, el login, el registro y el restablecimiento de
contraseña quedan **sin ningún tope de intentos** y nada avisa. Un `console.warn`
en los logs de un servidor no lo ve nadie.

El riesgo es concreto: `POST /api/auth/restablecer-password` fija la contraseña
de la cuenta que identifique el token del enlace. Sin tope, ese token se busca a
fuerza de intentos.

## Alcance

**Incluye:**
- Que en producción, sin Upstash configurado, el rate limit **no** deje pasar
  silenciosamente.
- Que en desarrollo se pueda seguir trabajando sin Upstash.
- Actualizar el test que hoy fija el comportamiento contrario.

**NO incluye:**
- Poner rate limit en los endpoints del panel que no lo tienen (es F-012).
- Cambiar los límites ni las ventanas de tiempo.
- Agregar dependencias ni un backend de rate limiting alternativo.

## Criterios de aceptación

- [ ] Con `NODE_ENV=production` y sin credenciales de Upstash, `verificarLimite`
      **no** devuelve "permitido". Falla cerrado.
- [ ] Fuera de producción, sin credenciales, sigue dejando pasar y avisando: no
      se puede romper el desarrollo local ni los tests.
- [ ] El aviso de configuración faltante es inequívoco en el log, no un
      `console.warn` perdido entre otros.
- [ ] El test que hoy fija "deja pasar (fail-open) cuando no hay credenciales"
      se actualiza para reflejar la regla nueva, cubriendo **los dos** entornos.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- `lib/rate-limit.ts` y `lib/rate-limit.test.ts`.
- Lo consumen `app/api/auth/registro`, `app/api/auth/olvide-password`,
  `app/api/auth/restablecer-password`, `app/api/equipo/invitacion/[token]/aceptar`
  y la reserva pública.
- **Ojo con el build:** `npm run build` corre sin variables de entorno reales. Si
  el módulo revienta al importarse cuando faltan credenciales, rompe el build —
  es el mismo error que tenía `lib/email.ts` y que se arregló creando el cliente
  en el primer uso, no al importar el módulo.
- No inventes variables de entorno nuevas: `NODE_ENV` ya existe.

## Fuera de alcance detectado

- El código de `crearLimitador`/`redis` ya construía el cliente de Upstash de
  forma condicional (`redisConfigurado ? new Redis(...) : null`), así que no
  tenía el bug de `lib/email.ts` (romper el build al importar sin credenciales).
  No hizo falta refactorizar a construcción perezosa; se verificó igual con
  `npm run build` real.
- El fail-open en el `catch` de `verificarLimite` (cuando Upstash está
  configurado pero falla en tiempo de ejecución, ej. caída del servicio) **no**
  se tocó: la ficha sólo pide cambiar el caso "sin credenciales configuradas".
  Cambiar también ese caso a fail-closed es una decisión de producto distinta
  (¿una caída transitoria de Upstash debe tumbar el login de todo el mundo?) y
  no estaba en el alcance ni en los criterios de aceptación.
- Endpoints sin rate limit (`F-012`) no se tocaron.
- Durante la verificación final se vio brevemente `lib/email.ts` con errores de
  `tsc` (tipo `HtmlSeguro`); no es un cambio mío — corresponde a otra tarea en
  curso en el mismo working tree (agrega escape de HTML en los correos) y al
  reintentar `tsc --noEmit` quedó en verde. No se tocó ese archivo.

## Decisiones tomadas

- Fallar cerrado en producción y abierto en desarrollo. Un rate limit que rompe
  el desarrollo local se termina desactivando a mano, que es peor.

## Bitácora

- **2026-09-06 — backend.** Se cambió `verificarLimite` en `lib/rate-limit.ts`:
  cuando falta `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, el
  comportamiento ahora depende de `NODE_ENV` (no se agregó ninguna variable
  nueva):
  - `NODE_ENV=production`: devuelve `{ permitido: false, restantes: 0 }`. Fail
    **cerrado**.
  - Cualquier otro valor de `NODE_ENV` (desarrollo, test, sin definir):
    devuelve `{ permitido: true, restantes: Infinity }` como antes. Fail
    **abierto**, para no romper `npm run dev` ni la suite de tests.
  - En ambos casos se emite `console.error` (antes era `console.warn`) con el
    prefijo `[rate-limit] CONFIGURACIÓN FALTANTE:` y menciona explícitamente
    si el entorno es de producción (bloqueando) o no (dejando pasar), una sola
    vez por proceso (`avisoMostrado`, sin cambios en esa parte).
  - El `catch` que cubre a Upstash configurado-pero-fallando en tiempo de
    ejecución sigue devolviendo fail-open sin cambios: no estaba en el alcance
    de esta ficha.
  - Se actualizó `lib/rate-limit.test.ts`: el test único "deja pasar
    (fail-open) cuando no hay credenciales de Upstash" se reemplazó por dos
    describes —`NODE_ENV=production` (fail-closed + assert del mensaje de
    `console.error`) y `NODE_ENV=development` (fail-open, como antes)— usando
    `vi.stubEnv("NODE_ENV", ...)` + `vi.resetModules()`, igual que ya se hacía
    para las credenciales de Upstash.
  - Se verificó que el módulo no construye nada al importarlo cuando faltan
    credenciales (`redis`/`limitadores` quedan en `null`, igual que antes del
    cambio), y se confirmó corriendo `npm run build` real (sin variables de
    entorno de Upstash) que no rompe.
  - `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (101 tests, 10
    archivos) y `npm run build` en verde.
