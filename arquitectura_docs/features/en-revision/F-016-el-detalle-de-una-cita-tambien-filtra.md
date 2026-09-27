---
id: F-016
titulo: El detalle de una cita también filtra por profesional
estado: en-revision
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

- [x] GET, PUT y DELETE de `/api/citas/[id]` resuelven la cita con
      `whereDeAgenda(actor, { id })`, no con `{ id, businessId }` a mano.
- [x] Un `worker` que pide la cita de un colega recibe **404**, no 403: no se le
      confirma que la cita existe (regla 1 de arquitectura).
- [x] Un `worker` sigue pudiendo leer, editar y borrar **las suyas**, igual que
      hoy. El dueño y el encargado siguen viendo todas.
- [x] Un `worker` sin `memberId` no llega a ninguna (el filtro falla cerrado, ya
      lo garantiza `whereDeAgenda`; el test lo confirma acá).
- [x] El `update` y el `delete` no pueden ejecutarse sobre un id que la
      verificación no devolvió. Si se resuelve con `findFirst` y después se
      escribe por `where: { id }`, entre una cosa y la otra no puede haber
      ninguna rama que se saltee la verificación.
- [x] Hay un test por verbo, y **cada uno falla contra el código de hoy**. Un
      test de aislamiento que pasa antes del arreglo no está probando el
      aislamiento.
- [x] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

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

- No se revisaron otros endpoints de detalle (`/api/pacientes/[id]`,
  `/api/configuracion/servicios/[id]`, etc.) por si tienen el mismo patrón de
  `findFirst({ id, businessId })` a mano. La ficha lo pide explícitamente fuera
  de alcance; si alguno tiene el mismo problema, es una ficha nueva.
- El cálculo de comisiones sobre `PUT /api/citas/[id]` (mencionado como
  motivación en el "Problema") no se tocó: es de F-003.
- **`app/dashboard/calendario/page.tsx:96` no mira `response.ok`** al hacer
  `PUT /api/citas/[id]` para cambiar el estado de una cita. Un 404 queda
  silencioso: la pantalla no avisa nada. Es preexistente y no lo introduce esta
  ficha —y en la práctica el profesional no debería tener citas ajenas en su
  lista, que ya filtra F-006— pero es el mismo patrón que hubo que arreglar en
  la sección de servicios al cerrar F-003: la respuesta de error existe y el
  cliente la tira. Lo encontró QA; queda para una ficha propia.

## Decisiones tomadas

- `verificarCita` pasó a recibir el `actor` (no `id, businessId`) y arma el
  `where` con `whereDeAgenda(actor, { id })`, igual que ya hacía
  `app/api/citas/route.ts`. Se mantiene como único punto de resolución para
  que PUT y DELETE no puedan divergir del filtro de GET.
- El `update`/`delete` posteriores siguen escribiendo por `where: { id }`
  simple: el id ya vino de un `findFirst` que pasó por `whereDeAgenda`, así que
  no hay ninguna rama entre la verificación y la escritura que pueda saltearse
  el filtro (igual que antes, sólo que ahora la verificación es la correcta).
- Se usó `actorDeSesion(session)` en vez de `session?.user?.businessId` en los
  tres handlers, siguiendo el patrón ya establecido en
  `app/api/citas/route.ts`. Esto además resuelve gratis el criterio "worker sin
  `memberId` no llega a ninguna": `actorDeSesion` sigue exigiendo `businessId`
  válido (401 si falta), y es `whereDeAgenda` quien niega todo cuando no hay
  `memberId` para un `worker` — no se agregó ninguna verificación nueva de rol
  en el endpoint.
- No se tocaron los `select`/`include` del GET/PUT (mismos campos que antes):
  fuera de alcance según la ficha.
- Tests nuevos en `app/api/citas/[id]/route.test.ts`, mockeando
  `getServerSession` y `prisma` igual que `app/api/citas/route.test.ts` (mismo
  helper `coincide` para simular el filtrado de Prisma sin base de datos real).

## Bitácora

- Reemplazados los tres handlers (GET, PUT, DELETE) de
  `app/api/citas/[id]/route.ts` para resolver la cita con
  `whereDeAgenda(actor, { id })` vía `actorDeSesion`, en vez de
  `{ id, businessId }` a mano.
- Agregado `app/api/citas/[id]/route.test.ts` con 12 tests: por cada verbo, un
  worker no llega a la cita de un colega (404) pero sí a la propia (200); el
  dueño llega a cualquiera del negocio; un worker sin `memberId` no llega a
  ninguna.
- Verificado manualmente que los 6 tests de aislamiento (2 por verbo) fallan
  contra el código de antes del fix (revert temporal, sin commitear) —
  confirma que el arreglo es necesario y que el test lo cubre. Salida completa
  en el reporte de la tarea.
- `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (190 tests, 16 archivos)
  y `npm run build` en verde tras el cambio.

### Recomendaciones del revisor (commit `8ba1119`)

Veredicto del revisor: **aprobado**, con dos recomendaciones no bloqueantes.
Ambas aplicadas; ninguna cambia comportamiento.

- `verificarCita` pide `Actor`, no `Actor | null`. El tipo laxo
  (`ReturnType<typeof actorDeSesion>`) era seguro —`whereDeAgenda(null)`
  devuelve `NADA` y niega todo— pero rompía la convención que el repo ya había
  fijado a propósito en `memberIdParaCita` (`lib/permisos.ts:78`). El costo no
  era una fuga: era que el compilador dejaba de obligar a poner la guarda de
  401 primero, y un handler futuro podía convertir "no hay sesión" en un 404
  silencioso.
- `update` y `delete` escriben por `existente.id`, no por `id` suelto. El
  criterio de la ficha se cumplía igual, pero la garantía dependía del orden de
  lectura: si alguien borraba la verificación, el `update` seguía compilando.
  Ahora `existente` queda sin declarar y el build falla.

  **Corrección, de la segunda pasada de QA.** Esa frase, como estaba escrita
  acá, prometía más de lo que cumple. El build falla si alguien borra **el
  bloque entero** (`const existente = ...` y su `if`). No falla si alguien
  vuelve a poner `id` en lugar de `existente.id`: QA lo probó, compila y los 21
  tests siguen en verde, porque en todos los fixtures `id === existente.id` por
  construcción. No es una vulnerabilidad —hoy no hay ninguna rama donde los dos
  valores difieran— pero es una garantía sobredimensionada, que es exactamente
  el tipo de frase que hace que nadie vuelva a mirar. Es el mismo error que
  hubo que corregir en F-003 con el `Restrict`, dos fichas seguidas. El alcance
  real: protege contra borrar la verificación, no contra sustituirla.

- El revisor dejó anotado, **para F-003 y no para esta ficha**: el `catch` del
  PUT (`route.ts`) se traga los errores no-Zod con un 500 sin loguear, mientras
  que el POST de `app/api/citas/route.ts` sí hace `console.error`. Es
  preexistente. Como el cálculo de comisiones va a colgar justo de ese `try`,
  conviene arreglarlo ahí.

### Cierre: segunda pasada de QA

Veredicto: **aprobada**. El bloqueante (encargado sin cobertura) y los dos
mayores quedaron cerrados; QA verificó cada uno revirtiendo `route.ts` al
código anterior, no leyendo la bitácora.

Un matiz que QA caracterizó bien y que conviene no perder: de los 9 tests
nuevos, los **6 de aislamiento** (worker denegado en la cita de un colega y en
la cita sin profesional) fallan contra el código vulnerable; los **3 de
dueño/encargado acceden** pasan en los dos lados. Es correcto que sea así: el
código vulnerable dejaba pasar a cualquier rol, así que "el encargado entra"
nunca fue un test de aislamiento. Es cobertura de rol, y vale como tal — pero
no hay que contarlo como prueba del arreglo.

**Hallazgo mayor, no bloqueante, que se va a ficha propia (F-018):** el helper
`coincide()` de los tests degrada en silencio. QA fue más lejos que la
verificación del orquestador: con el filtro del worker mutado a `OR`, no sólo
falla el test equivocado — los 3 tests nuevos de "worker no llega a la cita sin
profesional" **siguen en verde**, porque `coincide` devuelve `false` para todo y
entonces todo pedido de un worker termina en 404, correcto o no. O sea que da
confianza falsa justo en la cobertura que se acababa de agregar para cerrar el
bloqueante.

Lo que salva hoy a la suite no es esta ficha: es `lib/permisos.test.ts:102-107`,
que compara la forma cruda del filtro con `toEqual` sin pasar por `coincide`, y
que con esa mutación falla apuntando al lugar correcto. CI se pone rojo igual,
pero por una casualidad de arquitectura de tests, no porque los tests de este
endpoint sean confiables solos. Se corrige en F-018, no acá: `coincide` es
compartido con `app/api/citas/route.test.ts` y viene de F-001/F-002, así que
tocarlo desde esta ficha sería ampliar alcance.
