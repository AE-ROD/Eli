---
id: F-004
titulo: Cerrar la toma de cuenta por invitación
estado: en-revision
prioridad: crítica
areas: [backend]
rama: v1
estimacion: chica
max_iteraciones: 3
---

# F-004 — Cerrar la toma de cuenta por invitación

## Problema

**Cualquier dueño puede tomar la cuenta de cualquier usuario de la plataforma
sabiendo sólo su correo.** Lo encontró el `revisor` al cerrar F-002. Es código
preexistente, no lo introdujo ninguna ficha, y es la peor fuga entre negocios
del repositorio.

El ataque son dos requests:

1. `POST /api/equipo` invitando a `dueño@otro-negocio.com`. El único chequeo es
   que esa persona no sea ya miembro **de mi** negocio, así que pasa. La
   respuesta devuelve la invitación completa, **token incluido**
   (`app/api/equipo/route.ts:93`). El `GET` hace lo mismo con
   `workerInvitation.findMany` sin `select` (`:22-25`).
2. `POST /api/equipo/invitacion/<token>/aceptar` con la contraseña que yo elija.
   Como el usuario ya existe, el endpoint entra en el `else` de
   `app/api/equipo/invitacion/[token]/aceptar/route.ts:52-59` y le
   **sobrescribe `password` y `name`**.

Resultado: la contraseña del dueño del otro negocio queda pisada, entro como él
y veo su negocio entero. El rate limit por IP no lo frena: es una sola request.
No hay RLS detrás que lo contenga.

## Alcance

**Incluye:**
- Que ninguna respuesta de `/api/equipo` devuelva el `token` de la invitación.
- Que aceptar una invitación no toque nunca la contraseña ni el nombre de una
  cuenta que ya existe.

**NO incluye:**
- Rediseñar el flujo de invitaciones.
- Migrar `/api/equipo` a `lib/permisos.ts` (sigue owner-only; es otra ficha).
- El rate limit de los endpoints del panel (otra ficha).

## Criterios de aceptación

- [x] `GET /api/equipo` y `POST /api/equipo` usan `select` explícito y **no**
      devuelven `token` en ningún caso.
- [x] Aceptar una invitación con un email que **ya tiene cuenta** no modifica su
      `password` ni su `name`. Sólo se crea la membresía.
- [x] Ese caso exige que la persona ya haya iniciado sesión, y que la sesión
      corresponda al email de la invitación. Si no, no se crea nada.
- [x] Aceptar una invitación de un email **sin cuenta** sigue funcionando igual
      que hoy: crea el usuario con la contraseña que eligió y la membresía.
- [x] Una invitación ya aceptada o vencida sigue devolviendo 410.
- [x] `npm run lint`, `npx tsc --noEmit` y `npm test` en verde. Confirmado por
      el `revisor` corriendo los comandos él mismo.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | backend | Cerrar las dos filtraciones | backend | completada | — |
| 2 | revisor | Confirmar que el ataque ya no corre | revisor | completada | 1 |

## Contexto técnico

- `app/api/equipo/route.ts` — el `GET` y el `POST` que filtran el token.
- `app/api/equipo/invitacion/[token]/aceptar/route.ts` — el `else` que pisa la
  contraseña. El comentario dice que es para que una cuenta de Google pueda
  entrar con credenciales; ese caso se resuelve entrando con Google, no
  dejando que un tercero le fije la contraseña.
- `app/api/equipo/invitacion/[token]/route.ts` — el `GET` que consume la página
  `/unirse/[token]`. Verificar qué devuelve antes de tocar nada.
- `app/unirse/[token]/` — la página que consume el flujo. Si ahora hace falta
  sesión para el caso "usuario existente", tiene que decirlo en pantalla.

## Fuera de alcance detectado

- `app/api/equipo/invitacion/[token]/route.ts` (el `GET` público que consume
  `/unirse/[token]`) ya estaba bien: no devuelve `token` ni datos de más. No
  se tocó.
- `app/api/equipo/miembros/route.ts` no tiene relación con invitaciones ni con
  el bug; ya usa `select` explícito y `lib/permisos.ts`. No se tocó.
- La página `/iniciar-sesion` no soporta `callbackUrl` (después de loguearse
  siempre manda a `/dashboard`). Para no rediseñarla, el enlace agregado en
  `/unirse/[token]` manda a `/iniciar-sesion` a secas y el texto le dice al
  usuario que vuelva al enlace de invitación para aceptarla. Si se quiere un
  flujo de un solo paso (loguear → volver automáticamente → aceptar), es una
  mejora de UX aparte, no de seguridad.
- `POST /api/equipo` sigue siendo owner-only por chequeo manual, no por
  `lib/permisos.ts` — así lo pide la ficha, no se migró.

## Decisiones tomadas

- Una invitación no es un mecanismo de recuperación de contraseña. Para eso ya
  existe el flujo de `/recuperar-contrasena`.
- Cuando el email de la invitación ya tiene cuenta, `POST .../aceptar` exige
  sesión activa con ese mismo email (case-insensitive) y sólo entonces crea la
  membresía. No se toca `password` ni `name` bajo ninguna circunstancia para
  una cuenta preexistente. El body sigue aceptando `password` como opcional en
  el schema porque el frontend actual siempre lo manda (no distingue cuenta
  nueva de existente); se ignora en el camino de cuenta existente.
- La respuesta de éxito de `.../aceptar` ahora incluye `cuentaNueva: boolean`
  para que el frontend sepa si puede hacer `signIn` con la contraseña recién
  tejida (cuenta nueva) o si ya había una sesión válida y debe ir directo a
  `/dashboard` (cuenta existente). Sin este campo, el intento de `signIn` con
  una contraseña que el backend nunca usó habría fallado siempre y confundido
  al usuario con la pantalla de "cuenta creada".
- `select` explícito en `GET`/`POST /api/equipo`: se decidió qué campos
  exponer mirando `MiembroAPI`/`InvitacionAPI` en
  `app/dashboard/equipo/page.tsx` — nada de lo agregado rompe la UI porque son
  exactamente los campos que ya consumía.

## Bitácora

**2026-08-24 — backend (tarea #1: cerrar las dos filtraciones)**

Archivos tocados:
- `app/api/equipo/route.ts` — `GET` y `POST` con `select` explícito en
  `businessMember` y `workerInvitation`; el `POST` sigue necesitando el
  `token` internamente (para armar el enlace del correo) pero lo desestructura
  fuera del objeto antes de responder, así que la respuesta HTTP nunca lo
  contiene.
- `app/api/equipo/invitacion/[token]/aceptar/route.ts` — reescrito el manejo
  de "usuario ya existe": ya no llama `tx.user.update` con `password`/`name`.
  Ahora, si el email de la invitación tiene cuenta, exige
  `getServerSession(authOptions)` con `session.user.email` igual (case
  insensitive) al de la invitación; si no hay sesión o es de otro correo,
  responde 401 con `{ error, requiereSesion: true }` y no toca la base de
  datos. Si coincide, sólo crea la membresía (si no existía) y marca la
  invitación aceptada, dentro de la misma transacción que ya existía. El
  camino de "email sin cuenta" quedó igual que antes (crea usuario + password
  + membership), y el 410 de invitación vencida/aceptada no se tocó.
- `app/unirse/[token]/page.tsx` — cambio mínimo: lee `requiereSesion` y
  `cuentaNueva` de la respuesta. Si hace falta sesión, muestra el error del
  backend más un botón "Ir a iniciar sesión" con una aclaración de que hay que
  volver a este enlace. Si `cuentaNueva === false`, no intenta `signIn` (no
  hay contraseña nueva que usar) y manda directo a `/dashboard`.

Verificación de que el ataque de la ficha ya no corre:
- Request 1 (`POST /api/equipo` invitando a `dueño@otro-negocio.com`): la
  respuesta ya no incluye `token` en ningún campo (ni en `invitacion` del
  `POST` ni en `invitaciones` del `GET`). Sin el token, el atacante no puede
  construir la URL `/unirse/<token>` ni el `POST .../aceptar`, así que el
  ataque queda cortado en el primer paso.
- Aun si alguien consiguiera el token por otra vía (log, red, etc.), el
  request 2 (`POST .../aceptar` con una contraseña elegida por el atacante)
  ahora entra al branch de "usuario existente" porque `dueño@otro-negocio.com`
  ya tiene cuenta. Ese branch nunca toca `password` ni `name`: sólo revisa si
  quien hace el request tiene una sesión activa con ese mismo email. El
  atacante no tiene esa sesión (no conoce la contraseña de la víctima), así
  que recibe 401 con `requiereSesion: true` y no se crea ni modifica nada. La
  única forma de que ese branch complete es que la propia víctima, ya logueada
  con su contraseña real, acepte la invitación — en cuyo caso sólo se agrega
  una membresía a un negocio ajeno con la sesión de la propia víctima
  (comportamiento esperado de un flujo de invitación, no una toma de cuenta).

Tests:
- `app/api/equipo/route.test.ts` (nuevo) — 2 tests: `GET` no filtra `token` y
  usa `select`; `POST` no devuelve `token` en la respuesta aunque Prisma lo
  haya traído para armar el link del correo.
- `app/api/equipo/invitacion/[token]/aceptar/route.test.ts` (nuevo) — 5 tests:
  410 en invitación inexistente/vencida/aceptada; cuenta nueva sigue
  funcionando igual; cuenta existente sin sesión no crea nada; cuenta
  existente con sesión de otro correo no crea nada (reproduce el ataque de la
  ficha); cuenta existente con sesión propia sólo crea la membresía sin tocar
  `password`/`name`.
- Comando: `npx vitest run` → **65 tests, 65 passed** (7 archivos, incluye los
  2 nuevos).
- `npm run lint` → sin errores.
- `npx tsc --noEmit` → sin errores.
- `npm run build` → compila y genera todas las rutas, incluida
  `/api/equipo/invitacion/[token]/aceptar`.

Pendiente para el siguiente agente (`revisor`, tarea #2): confirmar
end-to-end que el ataque de dos requests ya no corre, y que la migración a
`lib/permisos.ts` de `/api/equipo` (fuera de alcance acá) no se coló por
error.


**2026-08-24 — orquestador (tarea #2: hallazgos del revisor, corregidos)**

El revisor confirmó que el ataque de dos requests **está cerrado en las dos
capas**, y probó variantes que no estaban en la ficha: aceptar dos veces
(secuencial y concurrente), la carrera entre el `findUnique` de usuario y el
`create`, invitado que ya es miembro de otro negocio, cuenta de Google sin
contraseña, y sesión nula o sin email. Todas fallan cerradas.

Tres cosas que sí había que corregir, ya hechas:

- **Mayúsculas en el correo (lo introdujo el arreglo mismo).** La búsqueda de la
  cuenta era exacta (`findUnique`) y la comparación contra la sesión pasaba por
  `toLowerCase()`: dos criterios distintos para decidir la misma identidad. Una
  invitación a `ana@x.com` con la cuenta `Ana@x.com` no veía la cuenta y caía al
  camino de "cuenta nueva", creando una segunda cuenta para la misma persona con
  el nombre que eligió quien invitó. Todas las búsquedas de correo van ahora con
  `mode: "insensitive"`, y la sesión se compara contra el correo de la cuenta
  encontrada, no el de la invitación. Con test de regresión.
- **Los dos `findMany` de `GET /api/equipo` sin `take`**, en líneas que la tarea
  #1 había editado. Tope de 200.
- **El mock de `user` en los tests no tenía `update`**, así que una regresión
  habría fallado por "no es una función" en vez de por el assert correcto. Ahora
  está, y dos tests afirman explícitamente que nunca se llama.

**Fuera de alcance, reportado por el revisor y corregido igual por ser
seguridad:** `POST /api/auth/restablecer-password` no tenía rate limit, siendo el
endpoint que fija la contraseña de la cuenta que identifique el token del enlace.
Sin tope, ese token se puede buscar a fuerza de intentos. Usa ahora el mismo
`verificarLimite("auth", ip)` que registro y aceptar.

**Verificación:** `npm run build`, `npm run lint`, `npx tsc --noEmit` y
`npm test` (66 tests, 7 archivos) en verde.

**Pendientes que el revisor dejó anotados y NO se tocaron** (cada uno es su
propia ficha):
- `lib/email.ts` interpola sin escapar el nombre que eligió quien invita dentro
  del HTML del correo: inyección de HTML en un mail que le llega a la víctima.
- `/api/equipo` sigue siendo owner-only por chequeo manual y con
  `session.user as any`. El rol `admin` todavía no gestiona equipo.
- Ningún endpoint autenticado del panel tiene rate limit.
- `lib/rate-limit` **falla abierto** si falta Upstash, y hay un test que lo
  consagra. Contradice "los permisos fallan cerrados".
- `/iniciar-sesion` no soporta `callbackUrl`: quien ya tiene cuenta debe volver
  al enlace de invitación a mano. Es UX, no seguridad.
