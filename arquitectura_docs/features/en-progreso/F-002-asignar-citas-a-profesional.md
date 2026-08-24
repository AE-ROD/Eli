---
id: F-002
titulo: Asignar citas a un profesional
estado: en-progreso
prioridad: alta
areas: [backend, frontend]
rama: v1
estimacion: media
max_iteraciones: 3
---

# F-002 — Asignar citas a un profesional

## Problema

**Las citas no tienen dueño.** El campo `Appointment.memberId` existe en el
esquema pero nunca se escribe: no hay una sola coincidencia en las rutas de citas
ni en las de reserva pública.

Sin saber quién atendió cada cita no se puede calcular ninguna comisión —que es el
diferenciador del producto— ni mostrarle su agenda a un profesional.

Hay además una incoherencia visible: los horarios **sí** se configuran por
profesional, pero después el sistema no usa esa información para asignar la cita.
Se configura algo que no se aplica.

## Alcance

**Incluye:**
- Guardar `memberId` al crear una cita desde el panel.
- Selector de profesional en el modal de nueva cita.
- Validar en el servidor que el profesional pertenece al negocio.
- Un `worker` sólo puede crear citas para sí mismo, sin importar lo que envíe.
- Endpoint mínimo para listar el equipo (necesario para el selector).

**NO incluye:**
- Elegir profesional en la reserva pública (feature aparte).
- Reasignar citas ya creadas.
- Qué hacer con las citas históricas sin asignar (feature aparte).

## Criterios de aceptación

- [ ] Al crear una cita desde el panel se guarda `memberId`.
- [ ] El selector muestra los miembros del negocio y una opción "Sin asignar".
- [ ] `POST /api/citas` rechaza con 404 un `memberId` de **otro** negocio.
- [ ] Un `worker` que envía el `memberId` de un compañero termina con la cita
      asignada **a sí mismo**: el servidor ignora lo enviado.
- [ ] Sólo `owner` y `admin` ven el selector; el `worker` no elige.
- [ ] `GET /api/citas` devuelve el profesional asignado.
- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | backend | `GET /api/equipo/miembros` + `memberId` en POST/GET de citas | backend | pendiente | — |
| 2 | frontend | Selector de profesional en el modal | frontend | pendiente | 1 |
| 3 | qa | Verificar criterios, sobre todo el intento de asignar a otro | qa | pendiente | 1,2 |
| 4 | revisor | Verificar aislamiento y permisos | revisor | pendiente | 3 |

## Contexto técnico

- `app/api/citas/route.ts` — el POST hoy no contempla `memberId`.
- `app/dashboard/calendario/_components/modalNuevaCita.tsx` — el modal.
- `app/dashboard/calendario/page.tsx` — arma el cuerpo del POST.
- El dueño no es `BusinessMember`: su `memberId` es `null`. Hoy "sin asignar" y
  "la atiende el dueño" son el mismo valor (`null`) y **no se distinguen**. Se
  acepta por ahora; queda anotado para las comisiones.
- Usa `lib/permisos.ts` (F-001). No repetir chequeos de rol en el endpoint.
- **Falta en `lib/permisos.ts`** (lo marcó el revisor al cerrar F-001; se agrega
  acá porque esta ficha es la primera que lo necesita):
  - `memberIdParaCita(actor, memberIdPedido)` — decide a quién se asigna la cita.
    Devuelve el `memberId` del propio actor si es `worker`, sin importar lo que
    haya mandado. Es el criterio "un worker termina con la cita asignada a sí
    mismo" convertido en función, para que ningún endpoint lo reimplemente.
  - `filtroDeClientes(actor)` — el equivalente de `filtroDeAgenda` para
    `Patient`. Sin él, listar clientes se resuelve a mano en cada endpoint.

## Fuera de alcance detectado

- `app/api/equipo/route.ts` (GET/POST existente) usa `session.user as any` y
  restringe a `role !== "owner"`, dejando a `admin` sin acceso pese a que
  `puedeGestionarEquipo` lo permite. No se tocó: es F-001, no esta ficha.

## Decisiones tomadas

- `memberIdParaCita(actor, memberIdPedido)`: si `actor` es `null` la función
  **lanza** (`throw`), no devuelve `null`. Un `null` de retorno ya tiene
  significado de negocio ("sin asignar"); usarlo también para "no hay sesión"
  mezclaría dos cosas distintas. En la práctica nunca se llega a esta rama
  porque el endpoint corta antes con 401 si no hay actor — el `throw` es una
  aserción de que la función no se usa sin haber pasado por `actorDeSesion`.
- `filtroDeClientes(actor)` acota solo por `businessId`, igual para los tres
  roles: los clientes son del negocio, no de un profesional en particular (a
  diferencia de la agenda).
- `GET /api/equipo/miembros` se restringió con `puedeGestionarEquipo` (owner y
  admin), igual que el resto de `/api/equipo`: sólo quien gestiona el negocio
  arma citas para otros, así que sólo ellos necesitan la lista completa del
  equipo. Devuelve 401 en el mismo estilo que el endpoint vecino (no hay un
  recurso concreto que ocultar con 404 acá, es un permiso de rol).
- El `GET`/`POST` de `/api/citas` no se migraron por completo a
  `actorDeSesion` para no ampliar el alcance: el `GET` sigue leyendo
  `session.user.businessId` directo (no lo necesitaba tocar); el `POST` sí usa
  `actorDeSesion` porque necesita el `Actor` completo para `memberIdParaCita`.
- No se agregó rate limit a `GET /api/equipo/miembros`: ningún endpoint
  autenticado del panel (`/api/equipo`, `/api/citas`) lo usa hoy — el rate
  limiting existente sólo cubre login/registro/reserva pública por IP.
- No se agregaron tests de endpoint (`route.test.ts`): no hay precedente en el
  repo de testear rutas de `app/api` (se prueba `lib/`), así que se mantuvo el
  patrón existente.

## Bitácora

- 2026-08-24 — backend (tarea #1): agregadas `memberIdParaCita` y
  `filtroDeClientes` a `lib/permisos.ts` con sus tests en
  `lib/permisos.test.ts` (formato `it.each`). Creado
  `app/api/equipo/miembros/route.ts` (GET, sólo owner/admin, id/nombre/rol).
  Modificado `app/api/citas/route.ts`: el `POST` valida `memberId` con zod
  (`nullable().optional()`), lo resuelve con `memberIdParaCita`, verifica
  pertenencia al negocio (404 si es de otro negocio o no existe) y lo guarda;
  el `GET` ahora incluye `memberId` y `member.user.name`/`role` en la
  respuesta. `npm run lint`, `npx tsc --noEmit` y `npx vitest run` en verde.
  Pendiente para frontend: selector en el modal (tarea #2) y ocultarlo para
  `worker`.
