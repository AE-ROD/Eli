---
id: F-001
titulo: Módulo central de permisos
estado: backlog
prioridad: alta
areas: [backend]
rama: v1
estimacion: chica
max_iteraciones: 3
---

# F-001 — Módulo central de permisos

## Problema

El control de acceso está disperso por los endpoints y el único chequeo real de
toda la aplicación es `role === "owner"` suelto. La consecuencia es que el rol
`admin` existe pero **no da ningún permiso**: hoy es sólo una etiqueta de color en
la lista de equipo.

Además el código usa `session.user as any` para leer el rol, lo que desactiva el
chequeo de tipos justo en la capa de seguridad.

Sin este módulo no se pueden construir el panel de administrador, el aislamiento
por profesional ni las comisiones: las tres necesitan preguntar "¿quién es y qué
puede hacer?" en un solo lugar.

## Alcance

**Incluye:**
- `lib/permisos.ts` como fuente única de verdad.
- Declarar `role`, `memberId` y `businessSlug` en `types/next-auth.d.ts`.
- Tests de cada regla de permiso.

**NO incluye:**
- Migrar los endpoints existentes para que lo consuman (eso es F-002 en adelante).
- Cambiar comportamiento visible de la aplicación.

## Criterios de aceptación

- [ ] Existe `lib/permisos.ts` con: `actorDeSesion`, `puedeGestionarEquipo`,
      `puedeCambiarRolDe`, `puedeEditarComisiones`, `puedeVerIngresosDelNegocio`,
      `puedeVerLiquidacionDe`, `puedeVerTodaLaAgenda`, `puedeEditarHorarioDe`,
      `filtroDeAgenda`, `perteneceAlNegocio`.
- [ ] Tres roles distinguibles: `owner` > `admin` > `worker`.
- [ ] `puedeEditarComisiones` es **true sólo para `owner`**. El `admin` no toca dinero.
- [ ] `puedeVerIngresosDelNegocio` es **false para `worker`**.
- [ ] Nadie puede cambiarse el rol a sí mismo.
- [ ] `filtroDeAgenda` devuelve `{}` para quien ve todo, y acota por `memberId`
      para el profesional.
- [ ] **Falla cerrado**: un `worker` sin `memberId` no ve nada, en lugar de verlo todo.
- [ ] `actorDeSesion` rechaza sesiones con rol desconocido o sin `businessId`.
- [ ] Ningún archivo del proyecto usa ya `session.user as any` para leer el rol.
- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | backend | Crear `lib/permisos.ts` y tipar la sesión | backend | pendiente | — |
| 2 | backend | Tests de todas las reglas | backend | pendiente | 1 |
| 3 | qa | Verificar criterios y buscar casos borde | qa | pendiente | 1,2 |
| 4 | revisor | Verificar aislamiento y fallo cerrado | revisor | pendiente | 3 |

## Contexto técnico

- `lib/auth.ts` arma la sesión: `role` es `"owner"` si el usuario tiene `business`
  propio, si no toma el rol de `memberships[0]` (`admin` | `worker`).
- El dueño **no** es `BusinessMember`, así que su `memberId` es `null`. Cualquier
  regla que dependa de `memberId` tiene que contemplarlo.
- `app/api/configuracion/horarios/route.ts` ya tiene una versión correcta de esta
  idea en `resolverMemberId()`: es el patrón a generalizar.
- Reglas aplicables: `reglas/01-arquitectura.md` (autorización y fallo cerrado).

## Fuera de alcance detectado

<!-- El agente completa acá lo que encuentre y no deba tocar. -->

## Decisiones tomadas

- Sólo el `owner` modifica comisiones; el `admin` gestiona operación pero no dinero
  (`docs/PRODUCTO.md` §3.4).

## Bitácora
