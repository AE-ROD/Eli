---
id: F-002
titulo: Asignar citas a un profesional
estado: en-revision
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
| 3 | qa | Verificar criterios, sobre todo el intento de asignar a otro | qa | completada | 1,2 |
| 4 | revisor | Verificar aislamiento y permisos | revisor | completada | 3 |

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
- 2026-08-24 — frontend (tarea #2): agregado `memberId` a `FormNuevaCita` y
  selector "Profesional" en `modalNuevaCita.tsx` con `<select>` nativo
  (mismo estilo que los `input` del modal; no había `select` de shadcn ni
  Radix disponible). El modal pide `GET /api/equipo/miembros` sólo si
  `puedeAsignarProfesional` es `true` y usa `.then/.catch` que deja
  `miembros` en `[]` ante cualquier falla (401 incluido): el modal sigue
  funcionando sin selector, no rompe. El `<select>` sólo se renderiza si
  además `miembros.length > 0`. En `page.tsx` se agregó `useSession()` para
  leer `session.user.role` (ya tipado en `types/next-auth.d.ts`, sin
  `as any`) y derivar `puedeAsignarProfesional = rol === "owner" || rol ===
  "admin"`; se pasa esa prop al modal y se agrega `memberId:
  formNueva.memberId || null` al body del `POST /api/citas`.
  `npm run lint`, `npx tsc --noEmit`, `npx vitest run` y `npm run build`
  en verde.

## Fuera de alcance detectado (frontend)

- `app/dashboard/page.tsx` y `app/dashboard/configuracion/page.tsx` usan
  `session.user as any` / `session?.user as any` para leer `businessSlug` y
  `role`/`businessId`/`memberId`. Los tipos ya están declarados en
  `types/next-auth.d.ts` y no hacen falta esos `as any`. No se tocó: no es
  parte de esta ficha ni de la tarea asignada.


**2026-08-24 — orquestador (tareas #3 y #4: qa y revisor)**

QA aprobó los siete criterios y verificó el camino completo: un `worker` no
puede quedarse con una cita asignada a otro ni llamando la API directo, y un
`memberId` de otro negocio devuelve 404. Entre los dos agentes salieron cuatro
huecos, los cuatro corregidos:

- `memberId: ""` devolvía un **500**. El string vacío pasaba el schema, `?? null`
  no lo normaliza, `if (memberId)` lo daba por ausente y se salteaba la
  verificación de pertenencia, así que llegaba al insert y violaba la foreign
  key. Ahora `|| null`: vacío es "sin asignar".
- `GET /api/citas` no tenía tope con rango de fechas
  (`take: fechaInicio ? undefined : 100`): `desde=1900&hasta=2999` traía el
  histórico completo, y esta ficha le sumó a cada fila el join con el
  profesional. Tope fijo de 500.
- `lib/auth.ts` le dejaba `memberId` al dueño si además era miembro de otro
  negocio, así que el par `(businessId, memberId)` de la sesión apuntaba a dos
  negocios distintos — la invariante de la que dependen todas las funciones de
  `lib/permisos.ts`. Hoy ninguna consulta lo explota porque todas revalidan
  `businessId`; la primera que no lo haga lee del negocio equivocado, y no hay
  RLS detrás.
- La membresía se elegía con `take: 1` sin `orderBy`. Postgres no garantiza
  orden: quien trabaje en dos negocios podía entrar a uno distinto en cada login.

Sobre lo que devolvió el agente backend, dos correcciones antes de aceptarlo:
`memberIdParaCita` lanzaba una excepción sin actor (única función del módulo que
no fallaba cerrada, y en un endpoint eso es un 500 en lugar de un 401 — ahora
pide un `Actor` no nulo y el tipo obliga a chequear la sesión antes), y
`filtroDeClientes` negaba con `{ id: { in: [] } }`, exactamente el patrón H2 que
el revisor había marcado en F-001. Los dos filtros que niegan usan ahora
`{ AND: [...] }`.

**Verificación:** `npm run build`, `npm run lint`, `npx tsc --noEmit` y
`npm test` (66 tests) en verde.

**Bloqueante para cerrar, decisión humana pendiente:** `filtroDeAgenda` y
`filtroDeClientes` existen, están testeados y **no los usa ningún endpoint**. Un
profesional que llame `GET /api/citas` ve toda la agenda del negocio, con
teléfonos, precios y notas de clientes que no atiende. Era así antes de esta
ficha —no es una regresión— pero ahora que las citas tienen dueño, la
información para aislarlas existe y no se está usando. Aplicarlo cambia lo que
la gente ve en pantalla, así que no se hace sin decisión.
