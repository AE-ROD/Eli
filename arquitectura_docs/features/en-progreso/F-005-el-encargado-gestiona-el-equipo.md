---
id: F-005
titulo: El encargado gestiona el equipo
estado: en-progreso
prioridad: alta
areas: [backend, frontend]
rama: v1
estimacion: chica
max_iteraciones: 3
---

# F-005 — El encargado gestiona el equipo

## Problema

**El rol `admin` sigue sin dar ningún permiso real.** Era medio motivo de esta
versión y hoy es una etiqueta de color en la lista de equipo.

`lib/permisos.ts` ya define `puedeGestionarEquipo` como dueño + encargado
(F-001), pero `/api/equipo` no lo usa: chequea `user.role !== "owner"` a mano,
leyendo la sesión con `session.user as any` — las dos cosas prohibidas por
`reglas/01-arquitectura.md`. La barra lateral hace lo mismo por su cuenta
(`barra-lateral.tsx:114`, `esOwner`), así que el encargado ni siquiera ve el
enlace a Equipo.

Resultado: la regla vive escrita y testeada en `lib/`, y sin aplicar en `app/`.

## Alcance

**Incluye:**
- `GET` y `POST /api/equipo` preguntan a `lib/permisos.ts` en vez de comparar
  roles a mano, y dejan de usar `session.user as any`.
- El encargado ve el enlace a Equipo en la barra lateral.
- El encargado puede invitar, con los mismos roles disponibles que el dueño.

**NO incluye:**
- **Cambiar el rol de un miembro ya existente.** Hoy no existe ese endpoint para
  nadie, así que no es una regresión. `puedeCambiarRolDe` sigue sin llamador y
  queda anotado como ficha aparte.
- Eliminar miembros del equipo (tampoco existe hoy).
- El rate limit de los endpoints del panel (ficha aparte).

## Criterios de aceptación

- [ ] Un `admin` autenticado recibe **200** en `GET /api/equipo` y ve los
      miembros e invitaciones **de su negocio**.
- [ ] Un `admin` puede invitar con `POST /api/equipo`.
- [ ] Un `worker` sigue recibiendo 401 en los dos.
- [ ] Ningún `admin` ve datos de otro negocio: las dos consultas siguen acotadas
      por el `businessId` del actor, y el `take` no se pierde.
- [ ] La barra lateral muestra "Equipo" a dueño y encargado, no al profesional,
      y decide con `lib/permisos.ts` en vez de comparar el rol a mano.
- [ ] `app/api/equipo/route.ts` no tiene ni un `session.user as any`.
- [ ] Hay tests de endpoint que fijan quién entra y quién no: `admin` sí,
      `worker` no, sin sesión no. `app/api/equipo/route.test.ts` ya existe.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | backend | Migrar `/api/equipo` a `lib/permisos.ts` + tests | backend | pendiente | — |
| 2 | frontend | Enlace a Equipo para el encargado | frontend | pendiente | 1 |
| 3 | revisor | Verificar aislamiento y que el `worker` siga afuera | revisor | pendiente | 1,2 |

## Contexto técnico

- `app/api/equipo/route.ts:11,55` — los dos `session.user as any` y el
  `user.role !== "owner"`. Sustituir por `actorDeSesion()` + `puedeGestionarEquipo()`.
  **Ojo:** el `businessId` para las consultas pasa a salir del actor.
- `components/app/layout/barra-lateral.tsx:114` — el `esOwner` que esconde el enlace.
- `app/api/equipo/miembros/route.ts` es el ejemplo a seguir: ya está migrado.
- Los `take: 200` y los `select` explícitos de `/api/equipo` vienen de F-004 y
  **no se tocan**: el `select` es lo que evita filtrar el token de invitación.

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

- El encargado puede invitar a otro encargado. El límite del encargado es el
  dinero, no la operación (`docs/PRODUCTO.md` §5), y `puedeCambiarRolDe` ya
  estaba definido con ese criterio en F-001.
- El encargado ve los correos de sus compañeros, igual que el dueño: son los
  datos del equipo que gestiona.

## Bitácora

### Tarea 1 (backend) — `app/api/equipo/route.ts` migrado a `lib/permisos.ts`

- **Qué se hizo:** `GET` y `POST` dejaron de leer `session.user as any` y de
  comparar `user.role !== "owner"`. Ahora usan `actorDeSesion(session)` +
  `puedeGestionarEquipo(actor)`, y el `businessId` de las cuatro consultas
  (`businessMember.findMany`, `workerInvitation.findMany`/`findFirst`/`create`,
  `business.findUnique`) sale de `actor.businessId`. No se tocaron los `select`
  explícitos ni los `take: 200` de F-004.
- **Decisión:** el fallback de `nombreNegocio` para el correo de invitación
  (`negocio?.name ?? user.businessName`) pasó a `negocio?.name ?? session?.user.businessName ?? ""`.
  `Actor` (de `lib/permisos.ts`) no trae `businessName` a propósito — sólo lleva
  lo necesario para permisos y aislamiento — así que ese dato se sigue leyendo
  de `session.user`, que ya está tipado en `types/next-auth.d.ts` (no es un
  `as any`, es un campo declarado del tipo `Session`).
- **Archivos:**
  - `app/api/equipo/route.ts` (modificado)
  - `app/api/equipo/route.test.ts` (modificado): se agregaron 8 tests nuevos
    sobre los 2 existentes (que no se tocaron): admin recibe 200 en GET y 201
    en POST; worker recibe 401 en los dos sin llegar a tocar Prisma; sin
    sesión, 401 en los dos; y un test que fija que `where.businessId` de
    `businessMember.findMany` y `workerInvitation.findMany` en el GET es el
    del actor.
- **Tests:** `npx vitest run app/api/equipo/route.test.ts` → 9/9 OK.
  `npx vitest run` (suite completa) → 73/73 OK. `npm run lint` limpio.
  `npx tsc --noEmit` limpio. `npm run build` OK.
- **Fuera de alcance detectado:** ninguno nuevo más allá de lo ya anotado en la
  ficha (cambiar rol / eliminar miembro, ambos explícitamente fuera).
- **Pendiente:** tarea 2 (frontend, enlace a Equipo en la barra lateral usando
  `lib/permisos.ts` en vez de `esOwner`) y tarea 3 (revisor).
