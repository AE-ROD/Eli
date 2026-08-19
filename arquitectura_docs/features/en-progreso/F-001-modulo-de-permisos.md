---
id: F-001
titulo: Módulo central de permisos
estado: en-progreso
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

- [x] Existe `lib/permisos.ts` con: `actorDeSesion`, `puedeGestionarEquipo`,
      `puedeCambiarRolDe`, `puedeEditarComisiones`, `puedeVerIngresosDelNegocio`,
      `puedeVerLiquidacionDe`, `puedeVerTodaLaAgenda`, `puedeEditarHorarioDe`,
      `filtroDeAgenda`, `perteneceAlNegocio`.
- [x] Tres roles distinguibles: `owner` > `admin` > `worker`.
- [x] `puedeEditarComisiones` es **true sólo para `owner`**. El `admin` no toca dinero.
- [x] `puedeVerIngresosDelNegocio` es **false para `worker`**.
- [x] Nadie puede cambiarse el rol a sí mismo.
- [x] `filtroDeAgenda` devuelve `{}` para quien ve todo, y acota por `memberId`
      para el profesional.
- [x] **Falla cerrado**: un `worker` sin `memberId` no ve nada, en lugar de verlo todo.
- [x] `actorDeSesion` rechaza sesiones con rol desconocido o sin `businessId`.
- [ ] Ningún archivo del proyecto usa ya `session.user as any` para leer el rol.
      **Pendiente**: el módulo y el tipado ya lo permiten, pero migrar los
      endpoints existentes es F-002+ (fuera de alcance de esta tarea, ver abajo).
- [x] `npm run lint`, `npx tsc --noEmit` y `npm test` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | backend | Crear `lib/permisos.ts` y tipar la sesión | backend | hecha | — |
| 2 | backend | Tests de todas las reglas | backend | hecha | 1 |
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

- Archivos que hoy usan `session.user as any` y deberían migrar a
  `actorDeSesion()` de `lib/permisos.ts` (no tocados, per alcance de esta ficha):
  - `lib/auth.ts` (callbacks `jwt`/`session`: arma el token/la sesión; ahora que
    los campos están tipados podría escribirlos sin `as any`, pero no es
    lectura de rol para autorizar y no se tocó para no ampliar el diff).
  - `app/api/equipo/route.ts` — chequea `user.role !== "owner"` a mano; con el
    módulo, `admin` podría gestionar equipo vía `puedeGestionarEquipo` /
    `puedeCambiarRolDe`, pero eso es cambio de comportamiento y corresponde a
    F-002+.
  - `app/api/configuracion/horarios/route.ts` — tiene su propio
    `resolverMemberId()`, que es **owner-only** y quedó desactualizado
    respecto a `puedeEditarHorarioDe()` (ver corrección de iteración 2 abajo):
    hoy trata a `admin` igual que `worker` (sólo su propio horario), cuando la
    regla correcta es que el encargado edite el de cualquier miembro. Cuando
    se migre este endpoint en F-002+, el `admin` va a ganar acceso que hoy no
    tiene — **no es una regresión**, es corregir el endpoint para que siga la
    regla real del producto.
  - `app/api/auth/completar-perfil/route.ts`
  - `app/dashboard/configuracion/page.tsx`, `app/dashboard/page.tsx`,
    `app/dashboard/layout.tsx` (lado servidor de esas páginas, si aplica)
- `puedeCambiarRolDe`: confirmado por el orquestador en iteración 2 — el
  `admin` sí puede cambiar roles de miembros del equipo (el límite del
  encargado es el dinero, no la operación, `docs/PRODUCTO.md` §5). Se deja
  como estaba.

## Decisiones tomadas

- Sólo el `owner` modifica comisiones; el `admin` gestiona operación pero no dinero
  (`docs/PRODUCTO.md` §3.4).
- `puedeCambiarRolDe` se basó en `puedeGestionarEquipo` (owner + admin), no sólo
  en `owner`: cambiar el rol de un miembro se interpretó como parte de
  "gestionar equipo" (`docs/PRODUCTO.md` §5, alcance del Encargado), separado
  de comisiones/dinero. Ver duda documentada en "Fuera de alcance detectado".
- `filtroDeAgenda` y `puedeVerLiquidacionDe`/`puedeVerTodaLaAgenda`/
  `puedeVerIngresosDelNegocio` dan acceso completo a `owner` **y** `admin`,
  siguiendo `docs/PRODUCTO.md` §3.4 (Encargado ve liquidación de todos) y §5
  (Encargado: equipo, agenda, horarios y clientes).
- `puedeEditarHorarioDe` (corregido en iteración 2): dueño **y encargado**
  editan el horario de cualquier miembro, o el general del negocio
  (`memberIdObjetivo` null); el profesional sólo el propio. Horarios son
  operación, no dinero (`docs/PRODUCTO.md` §5), así que tiene que responder
  igual que `puedeCambiarRolDe` — ambas son "gestionar equipo/operación" y no
  pueden dar resultados distintos para el mismo rol. La primera versión
  copiaba de más el `resolverMemberId()` owner-only de
  `app/api/configuracion/horarios/route.ts` (que quedó desactualizado, ver
  "Fuera de alcance detectado") en lugar de generalizar la regla real.
- Falla cerrada de `filtroDeAgenda`: para quien no puede ver nada (sin actor,
  o profesional sin `memberId`) se devuelve `{ id: { in: [] } }`, un filtro de
  Prisma que garantiza cero resultados sin asumir el formato del `id`
  (evita usar un string mágico que "nunca matchee").

## Bitácora

### 2026-08-17 — backend (F-001, tareas 1 y 2)

**Hecho:**
- Creado `lib/permisos.ts`: tipo `Role`, interfaz `Actor` y las 10 funciones
  pedidas por la ficha (`actorDeSesion`, `perteneceAlNegocio`,
  `puedeGestionarEquipo`, `puedeCambiarRolDe`, `puedeEditarComisiones`,
  `puedeVerIngresosDelNegocio`, `puedeVerLiquidacionDe`,
  `puedeVerTodaLaAgenda`, `puedeEditarHorarioDe`, `filtroDeAgenda`).
- Declarados `role: Role`, `memberId: string | null` y `businessSlug: string`
  en `Session.user`, `User` y `JWT` de `types/next-auth.d.ts`, importando
  `Role` desde `lib/permisos.ts` como fuente única.
- Escritos 37 tests en `lib/permisos.test.ts`, uno por comportamiento,
  incluyendo los dos casos de fallo cerrado (`worker` sin `memberId` en
  `puedeVerLiquidacionDe`, `puedeEditarHorarioDe` y `filtroDeAgenda`) y el
  rechazo de `actorDeSesion` ante rol desconocido / `businessId` faltante /
  sesión nula.

**Archivos:**
- `lib/permisos.ts` (nuevo)
- `lib/permisos.test.ts` (nuevo)
- `types/next-auth.d.ts` (modificado)

**No tocado (fuera de alcance de esta tarea):** ningún endpoint ni `lib/auth.ts`.
Ver "Fuera de alcance detectado" arriba para el detalle y la duda sobre
`puedeCambiarRolDe` que conviene confirmar antes de F-002.

**Verificación:** `npx tsc --noEmit`, `npm run lint` y `npm test` (63 tests,
5 archivos) en verde.

**Pendiente:** tareas 3 (qa) y 4 (revisor) de esta ficha; migrar endpoints en
F-002+.

### 2026-08-17 — backend (F-001, iteración 2: corrección de coherencia)

**Hecho:** el orquestador confirmó la interpretación de `puedeCambiarRolDe`
(admin sí cambia roles) y detectó una incoherencia: `puedeEditarHorarioDe`
trataba al `admin` como `worker` (sólo su propio horario), contradiciendo que
horarios son operación (no dinero) igual que cambiar roles. Corregido para
que dueño y encargado editen el horario de cualquier miembro; el profesional
sólo el propio. Actualicé el comentario de la función (ya no dice "copiar" el
patrón owner-only de `resolverMemberId()`, sino generalizar la regla real) y
agregué dos tests: encargado edita el horario de otro miembro, y encargado
edita el horario general del negocio (`memberIdObjetivo` null).

**Archivos:** `lib/permisos.ts`, `lib/permisos.test.ts` (modificados).

**Verificación:** `npx tsc --noEmit`, `npm run lint` y `npm test` (64 tests,
5 archivos) en verde.

**Pendiente:** igual que antes — tareas 3 (qa) y 4 (revisor); al migrar
`app/api/configuracion/horarios/route.ts` en F-002+, el `admin` va a ganar
acceso al horario de otros miembros que hoy no tiene (ver "Fuera de alcance
detectado" — no es una regresión, es alinear el endpoint con la regla real).

### 2026-08-17 — backend (F-001, iteración 3: cobertura de `actor: null`)

**Hecho:** QA aprobó el comportamiento pero encontró un hueco de cobertura:
las siete funciones que reciben `actor: Actor | null`
(`puedeGestionarEquipo`, `puedeCambiarRolDe`, `puedeEditarComisiones`,
`puedeVerIngresosDelNegocio`, `puedeVerLiquidacionDe`, `puedeVerTodaLaAgenda`,
`puedeEditarHorarioDe`) no tenían ningún test que las llamara con `null` —el
camino real cuando `actorDeSesion` rechaza una sesión inválida o vencida—, así
que un refactor accidental de `actor?.role` a `actor!.role` habría pasado sin
que ningún test se quejara. Agregué el describe `"sin actor: toda función
niega"` con un test por función, más `puedeEditarComisiones(worker) → false`
para completar el trío de roles. No toqué `lib/permisos.ts`, sólo tests, tal
como se pidió.

**Archivos:** `lib/permisos.test.ts` (modificado).

**Verificación:** `npx tsc --noEmit`, `npm run lint` y `npm test` (72 tests en
total, 46 en `lib/permisos.test.ts`, 5 archivos) en verde.

**Pendiente:** tareas 3 (qa, ya revisó comportamiento — confirmar que este
hueco quedó cerrado) y 4 (revisor) de esta ficha; migrar endpoints en F-002+.
