---
id: F-016
titulo: El detalle de una cita también filtra por profesional
estado: en-progreso
prioridad: alta
areas: [backend]
rama: f-016-detalle-de-cita
estimacion: chica
max_iteraciones: 3
---

# F-016 — El detalle de una cita también filtra por profesional

## Problema

F-006 cerró la agenda: un profesional ve en la lista sólo sus citas. Pero cerró
**la lista**. `app/api/citas/[id]/route.ts` nunca se tocó, y ahí los tres
handlers filtran así:

```ts
prisma.appointment.findFirst({ where: { id, businessId: session.user.businessId } })
```

Sin `memberId`. O sea que hoy un `worker`, con su sesión legítima y un id de
cita:

- **GET** lee la cita de un colega **con el cliente incluido**: nombre, email y
  teléfono (`route.ts:32-34`).
- **PUT** le cambia hora, precio, estado y notas.
- **DELETE** se la borra.

Los ids son `cuid()`, no correlativos, así que no se adivinan de a uno — pero no
hace falta adivinarlos: la propia app los reparte. Cualquier respuesta de la
agenda, un enlace viejo, o el id que quedó en el historial del navegador de una
computadora compartida alcanza. "Difícil de adivinar" no es un control de
acceso; es lo que se dice de un control que no existe.

Es la misma clase de agujero que F-006, en el endpoint de al lado, y es además
**precondición del cálculo de comisiones**: completar una cita va a pasar por
`PUT /api/citas/[id]`, y ahí se va a congelar plata. No se le cuelga un cálculo
de dinero a un endpoint que no sabe de quién es la cita.

Lo detectó el revisor en la segunda pasada de F-003.

## Alcance

**Incluye:**
- Los tres handlers de `app/api/citas/[id]/route.ts` (GET, PUT, DELETE) pasan por
  `whereDeAgenda` de `lib/permisos.ts`.
- Tests que prueben que un `worker` no llega a la cita de un colega por ninguno
  de los tres verbos, y que sí llega a la suya.

**NO incluye:**
- Cambiar qué campos devuelve el endpoint.
- Tocar `lib/permisos.ts`. Las primitivas ya existen y ya están probadas; acá se
  usan, no se agregan.
- Cualquier cosa de comisiones. F-003 va por su rama.
- Revisar otros endpoints de detalle. Si aparece otro con el mismo patrón, va a
  "Fuera de alcance detectado", no se arregla acá.

## Criterios de aceptación

- [ ] GET, PUT y DELETE de `/api/citas/[id]` resuelven la cita con
      `whereDeAgenda(actor, { id })`, no con `{ id, businessId }` a mano.
- [ ] Un `worker` que pide la cita de un colega recibe **404**, no 403: no se le
      confirma que la cita existe (regla 1 de arquitectura).
- [ ] Un `worker` sigue pudiendo leer, editar y borrar **las suyas**, igual que
      hoy. El dueño y el encargado siguen viendo todas.
- [ ] Un `worker` sin `memberId` no llega a ninguna (el filtro falla cerrado, ya
      lo garantiza `whereDeAgenda`; el test lo confirma acá).
- [ ] El `update` y el `delete` no pueden ejecutarse sobre un id que la
      verificación no devolvió. Si se resuelve con `findFirst` y después se
      escribe por `where: { id }`, entre una cosa y la otra no puede haber
      ninguna rama que se saltee la verificación.
- [ ] Hay un test por verbo, y **cada uno falla contra el código de hoy**. Un
      test de aislamiento que pasa antes del arreglo no está probando el
      aislamiento.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- `whereDeAgenda(actor, extra)` devuelve `{ AND: [filtro, extra] }`: combinarlo
  con `{ id }` no puede anular el filtro (por eso existe la envoltura en `AND`,
  ver el comentario en `lib/permisos.ts:140-148`).
- `actorDeSesion(session)` devuelve `null` si la sesión no sirve, y todas las
  funciones de permisos fallan cerrado con `null`. El patrón a copiar está en
  `app/api/citas/route.ts:19-24`.
- `prisma.appointment.update`/`delete` necesitan un `where` único, así que el
  camino sigue siendo: resolver con `findFirst(whereDeAgenda(...))` → 404 si no
  aparece → escribir por `id`. Lo que cambia es el filtro de la resolución.
- Tests: `lib/permisos.test.ts` es el modelo de cómo se prueban estos filtros
  sin base de datos (se arma el `where` y se verifica su forma). Si el test del
  endpoint necesita más que eso, se dice en la ficha en vez de inventar
  infraestructura de test nueva.

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

<!-- El agente completa acá. -->

## Bitácora

<!-- El agente completa acá. -->
