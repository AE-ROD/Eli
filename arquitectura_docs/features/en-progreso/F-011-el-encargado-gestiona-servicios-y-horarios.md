---
id: F-011
titulo: El encargado gestiona servicios y horarios
estado: en-progreso
prioridad: alta
areas: [backend, frontend]
rama: v1
estimacion: media
max_iteraciones: 3
---

# F-011 — El encargado gestiona servicios y horarios

## Problema

F-005 hizo que el encargado gestione el equipo. Pero la página de configuración
sigue repartiendo todo con su propio `esOwner`, así que **el encargado todavía no
gestiona servicios ni horarios de otros**, aunque `puedeGestionarServicios` y
`puedeEditarHorarioDe` en `lib/permisos.ts` digan hace rato que puede.

Es el mismo problema que F-005 sacó de `/api/equipo`, en la pantalla de al lado:
la regla vive en `lib/` y la pantalla la reimplementa a mano.

Peor: `app/api/configuracion/horarios/route.ts` tiene su propio
`resolverMemberId()`, que es **owner-only** y quedó desactualizado respecto de
`puedeEditarHorarioDe()`. Hoy trata al encargado igual que a un profesional
—sólo su propio horario— cuando la regla del producto (`docs/PRODUCTO.md` §5)
dice que el encargado edita el de cualquiera.

## Alcance

**Incluye:**
- `app/dashboard/configuracion/page.tsx` decide con `lib/permisos.ts`, no con un
  `esOwner` propio.
- Los endpoints de servicios y horarios preguntan a `lib/permisos.ts`.
- El encargado gestiona servicios y edita el horario de cualquier miembro.

**NO incluye:**
- El dinero: comisiones y facturación siguen siendo sólo del dueño
  (`puedeEditarComisiones`). Es el límite del encargado.
- Rediseñar la pantalla de configuración.
- El rate limit de esos endpoints (F-012).

## Criterios de aceptación

- [x] Un `admin` ve y usa la sección de servicios en configuración.
- [x] Un `admin` edita el horario de cualquier miembro del negocio y el horario
      general; un `worker` sigue editando sólo el propio.
- [x] Un `worker` no ve la sección de servicios.
- [x] Ningún archivo tocado compara roles a mano ni usa `session.user as any`
      para autorizar.
- [x] **Aislamiento intacto:** ningún miembro de otro negocio es alcanzable;
      404, nunca 403.
- [x] Tests de endpoint que fijen quién entra y quién no en servicios y horarios.
- [x] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- `app/dashboard/configuracion/page.tsx` — el `esOwner` reparte seis decisiones.
- `app/api/configuracion/servicios/route.ts` y `.../servicios/[id]/route.ts`.
- `app/api/configuracion/horarios/route.ts` — el `resolverMemberId()` owner-only.
- `lib/permisos.ts` ya tiene `puedeGestionarServicios` y `puedeEditarHorarioDe`.
  `puedeEditarHorarioDe` recibe `Miembro { id, businessId }`, no un id suelto: es
  lo que impide alcanzar a alguien de otro negocio.
- `app/api/equipo/route.ts` es el ejemplo a copiar: así quedó tras F-005.
- **Es un cambio de comportamiento esperado, no una regresión.** El `admin` gana
  acceso que hoy no tiene, y eso es corregir la pantalla para que siga la regla
  real del producto (ya estaba anotado en F-001).

## Fuera de alcance detectado

- `app/api/configuracion/servicios/route.ts` (GET/POST) y `.../servicios/[id]/route.ts`
  no llevan `take` en los listados, contra la regla general de
  `arquitectura_docs/reglas/01-arquitectura.md` ("todo listado lleva take"). No
  se tocó: es preexistente, no forma parte de la migración de permisos y un
  negocio no tiene miles de servicios, pero queda anotado para una tarea aparte.
- `resolverObjetivo()` en `horarios/route.ts` devuelve 401 (no 403) cuando un
  `worker` pide el horario de otro miembro del mismo negocio: es una decisión
  de diseño (sigue la convención "No autorizado" ya usada en `/api/equipo` y
  `/api/citas` para permisos insuficientes dentro del mismo negocio), separada
  del 404 que sí exige el aislamiento entre negocios. No estaba en el alcance
  cuestionar esa convención, así que se respetó.

## Decisiones tomadas

- El límite del encargado es el dinero, no la operación (`docs/PRODUCTO.md` §5).
  Servicios y horarios son operación.
- El 404 se reserva estrictamente para "el recurso es de otro negocio" (existe
  o no, misma respuesta). El caso "mismo negocio, rol insuficiente" (worker
  pidiendo el horario de otro miembro) usa 401, igual que el resto de los
  endpoints de permisos del proyecto.

## Bitácora

- Migrados a `lib/permisos.ts` (patrón de F-005/`app/api/equipo/route.ts`,
  `actorDeSesion` + función de permiso, sin comparar roles a mano ni
  `session.user as any`):
  - `app/dashboard/configuracion/page.tsx`: el `esOwner` propio se reemplazó
    por `gestionaElNegocio`, `puedeEditarHorarioDe` y `puedeGestionarServicios`
    (más `esDueño` sólo para el texto "Mi horario" vs "Mi horario de atención",
    que no es una decisión de autorización). El `admin` ahora ve la sección de
    servicios y el selector de horario de todo el equipo, no sólo el propio.
  - `app/api/configuracion/servicios/route.ts` y `.../servicios/[id]/route.ts`:
    GET/POST/PUT/DELETE preguntan a `puedeGestionarServicios`. El filtro y la
    verificación de pertenencia (404 en detalle) ya usaban `businessId` del
    actor; ahora ese `businessId` sale de `actor`, no de `session.user`
    suelto.
  - `app/api/configuracion/horarios/route.ts`: se borró el `resolverMemberId()`
    owner-only. Se agregó `resolverObjetivo()`, que sin `memberId` en la URL
    resuelve el horario propio (dueño → `null`/general; encargado/profesional →
    su `memberId`) y con `memberId` busca el `BusinessMember` real en la base y
    llama a `puedeEditarHorarioDe(actor, miembro)` — nunca confía en el id
    suelto de la URL. Miembro inexistente o de otro negocio → misma respuesta
    404 ("Miembro no encontrado"); mismo negocio pero sin permiso (worker
    pidiendo el de otro) → 401.
- Tests nuevos (32 casos, los tres archivos en verde):
  `app/api/configuracion/servicios/route.test.ts`,
  `app/api/configuracion/servicios/[id]/route.test.ts`,
  `app/api/configuracion/horarios/route.test.ts`. Cada uno cubre: dueño/admin
  entran, worker no (o sólo lo propio en horarios), sin sesión 401, y un
  miembro/servicio de otro negocio da 404 nunca 403 (verificado con una sesión
  de "negocio-2" contra datos de "negocio-1", igual que en
  `app/api/equipo/route.test.ts`).
- Verificación de aislamiento: en `horarios`, el caso crítico es que
  `resolverObjetivo()` recibe el `memberId` de la URL, lo resuelve contra la
  base (`businessMember.findUnique`) y compara su `businessId` real contra
  `actor.businessId` con `mismoNegocio()` antes de llamar a
  `puedeEditarHorarioDe`. El test "un miembro de otro negocio da 404, nunca
  403" simula exactamente eso: el miembro existe pero pertenece a
  `"negocio-2"` mientras el actor es de `"negocio-1"` → 404, y
  `workSchedule.findMany`/`$transaction` nunca se llaman. En servicios, la
  pertenencia se verifica igual que antes (`findFirst` con `id` +
  `businessId: actor.businessId`), ahora con `actor.businessId` en vez de
  `session.user.businessId`; el test correspondiente confirma que el `where`
  usa el `businessId` del actor y que un servicio no encontrado con ese filtro
  da 404, no 403.
- `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (134/134) y
  `npm run build` en verde.
