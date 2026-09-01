---
id: F-006
titulo: El profesional ve sólo lo suyo
estado: en-progreso
prioridad: alta
areas: [backend]
rama: v1
estimacion: media
max_iteraciones: 3
---

# F-006 — El profesional ve sólo lo suyo

## Problema

`filtroDeAgenda` y `filtroDeClientes` existen, están testeados y **no los llama
nadie**. La regla vive escrita en `lib/` y sin aplicar en `app/`.

Se vio en vivo al correr el sistema con datos de demo: en el dashboard de Carla,
una `worker`, aparecen **"Ingresos del mes"** y **"Resumen del negocio"** con la
facturación del local, y la cartera completa de clientes con sus teléfonos.
Debería ver su agenda y nada más (`docs/PRODUCTO.md` §5).

No es una regresión —era así desde antes— pero desde F-002 las citas tienen
dueño, así que la información para aislarlas por fin existe.

## Alcance

**Incluye:**
- `GET /api/citas` filtra con `filtroDeAgenda`.
- `GET /api/pacientes` filtra con `filtroDeClientes`.
- `GET /api/dashboard/stats` no le da al profesional los números del negocio.
- Una forma de combinar el filtro que **no** se pueda pisar por accidente.

**NO incluye:**
- Cambiar la UI del dashboard más allá de no mostrar lo que el endpoint ya no
  devuelve. Si una tarjeta queda vacía para el profesional, se oculta; no se
  rediseña nada.
- `GET /api/citas/[id]`, `PUT` y `DELETE` de una cita concreta: hoy verifican
  pertenencia al negocio pero no al profesional. Queda anotado como ficha aparte.
- El rate limit de los endpoints del panel (ficha aparte).

## Criterios de aceptación

- [ ] Un `worker` que llama `GET /api/citas` recibe **sólo** las citas cuyo
      `memberId` es el suyo. Dueño y encargado siguen viendo todas las del negocio.
- [ ] Un `worker` no recibe ingresos del negocio en `GET /api/dashboard/stats`.
      Lo que sí puede ver de lo suyo se decide con `lib/permisos.ts`, no a mano.
- [ ] `GET /api/pacientes` usa `filtroDeClientes`.
- [ ] **El filtro no se puede pisar combinándolo.** Hoy se hace
      `{ ...filtroDeAgenda(actor), ...otrasCondiciones }` y cualquier clave
      repetida borra la negación: pasó ya dos veces (H2 en F-001 con `id`, y de
      nuevo con `AND` en F-002). Exportar `whereDeAgenda(actor, extra)` que
      devuelva `{ AND: [filtro, extra] }`, y que los endpoints usen eso.
      Un objeto que sólo es seguro si el llamador se acuerda de no pisar una
      clave no es un límite de seguridad, es una convención.
- [ ] Tests: un `worker` no ve la cita de un colega; el dueño sí ve las dos; y
      uno que fije que combinar el filtro con otra condición **no** lo anula.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | backend | `whereDeAgenda` + aplicar los filtros en los tres endpoints | backend | pendiente | — |
| 2 | qa | Verificar los criterios con los tres roles | qa | pendiente | 1 |
| 3 | revisor | Verificar aislamiento y que el filtro no se pueda anular | revisor | pendiente | 2 |

## Contexto técnico

- `app/api/citas/route.ts:46-53` — el `where` que hoy sólo filtra por negocio, y
  que además combina `patientId` y el rango de fechas por spread.
- `app/api/pacientes/route.ts` y `app/api/dashboard/stats/route.ts`.
- `lib/permisos.ts` — `filtroDeAgenda`, `filtroDeClientes`,
  `puedeVerIngresosDelNegocio`, `puedeVerTodaLaAgenda`.
- El dueño **no** es `BusinessMember`: su `memberId` es `null`. Una cita sin
  asignar y una cita "del dueño" hoy son el mismo valor y no se distinguen
  (anotado desde F-002). Para el dueño no importa acá, porque ve todas.
- Un `worker` sin `memberId` no debe ver **ninguna** cita, no todas. Ya está
  resuelto dentro de `filtroDeAgenda`; no lo reimplementes en el endpoint.

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

- Los clientes son del negocio, no del profesional: `filtroDeClientes` acota por
  negocio y da lo mismo para los tres roles. La decisión ya estaba tomada en
  F-002 al escribir la función; acá sólo se aplica.

## Bitácora
