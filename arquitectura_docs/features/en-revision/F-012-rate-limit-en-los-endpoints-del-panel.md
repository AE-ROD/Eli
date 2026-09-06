---
id: F-012
titulo: Rate limit en los endpoints del panel
estado: en-revision
prioridad: media
areas: [backend]
rama: v1
estimacion: media
max_iteraciones: 3
---

# F-012 — Rate limit en los endpoints del panel

## Problema

La regla 5 del contrato dice **"rate limit en todo endpoint"**. Hoy sólo lo
tienen los de autenticación, la invitación y la reserva pública. **Ningún
endpoint autenticado del panel lo tiene**: citas, clientes, servicios, horarios,
equipo, chats, estadísticas.

Lo marcaron `qa` y el `revisor` en cuatro fichas distintas, y cada endpoint nuevo
agrandaba la deuda. F-010 acaba de hacer que el rate limit falle cerrado en
producción, así que ahora la infraestructura es confiable y conviene usarla.

Sesión válida no es lo mismo que uso legítimo: una cuenta comprometida, o un
script de un cliente propio, puede recorrer `GET /api/pacientes` a mil por hora y
llevarse la cartera entera del negocio, o llenar la base de citas.

De paso, dos incumplimientos de la misma familia detectados al pasar:

- **Listados sin `take`** en `app/api/configuracion/servicios/route.ts`
  (`01-arquitectura.md` lo prohíbe explícitamente).
- `app/api/pacientes/route.ts` (POST) todavía usa `session.user.businessId`
  directo en vez de `actorDeSesion`, dejando dos patrones distintos en el mismo
  archivo.

## Alcance

**Incluye:**
- Rate limit en los endpoints autenticados del panel.
- `take` en los listados que no lo tienen.
- Unificar `POST /api/pacientes` con `actorDeSesion`.

**NO incluye:**
- Cambiar el comportamiento de `lib/rate-limit.ts` (eso fue F-010).
- El `catch` que sigue fallando abierto cuando Upstash está configurado pero
  caído: decisión aparte, ya anotada en F-010.
- Nuevas variables de entorno ni un backend de rate limiting distinto.

## Criterios de aceptación

- [x] Los endpoints autenticados del panel aplican rate limit.
- [x] **El límite se cuenta por sesión, no sólo por IP.** Varias personas del
      mismo negocio salen por la misma IP —un salón con wifi compartido— y no
      pueden gastarse el cupo entre ellas. Usá algo del actor como clave.
- [x] Los límites de un panel son **mucho más altos** que los de login: un
      calendario legítimo dispara varias consultas por minuto. Un límite que
      moleste al uso normal se termina sacando, que es peor que no tenerlo.
- [x] Un 429 devuelve un mensaje que se entienda, no un error crudo.
- [x] Ningún listado queda sin `take`.
- [x] `POST /api/pacientes` usa `actorDeSesion` como el resto del archivo.
- [x] Tests que fijen que un endpoint del panel responde 429 al pasarse.
- [x] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- `lib/rate-limit.ts` — `verificarLimite(tipo, clave)` y `obtenerIp(request)`.
  Hay tipos de límite ya definidos; mirá cuáles hay antes de inventar uno.
- Endpoints a cubrir: `app/api/citas`, `app/api/citas/[id]`,
  `app/api/pacientes`, `app/api/pacientes/[id]`, `app/api/configuracion/*`,
  `app/api/equipo/*`, `app/api/chats/*`, `app/api/dashboard/stats`.
- **Repetir seis líneas de guardia en cada handler es justo el patrón que se
  olvida en el endpoint número trece.** Buscá una forma de que sea difícil
  olvidarse, como se hizo con `whereDeAgenda` (F-006) y `HtmlSeguro` (F-009).
- Ojo con el cron (`app/api/cron/recordatorios`): lo llama Vercel, no una
  persona. No lo limites por sesión.

## Fuera de alcance detectado

- `app/api/auth/completar-perfil/route.ts` usa `session.user as any` en vez de
  `actorDeSesion` (viola la regla de "nada de `as any`" en la capa de
  seguridad, `06-stack.md`). No es el archivo que pide la ficha (`POST
  /api/pacientes`) y no lo toqué.
- `GET /api/reservar/[slug]` y `GET /api/reservar/[slug]/slots` no tienen rate
  limit (sólo lo tiene el `POST /confirmar`). Son páginas públicas de reserva,
  no "endpoints autenticados del panel": quedan fuera del alcance de esta
  ficha tal como está escrita, pero conviene una ficha aparte — sin sesión que
  las module, sólo las protege el límite por IP.
- `next build` avisa que la convención de archivo `middleware.ts` está
  deprecada a favor de `proxy.ts` en Next 16. Es un aviso preexistente (el
  archivo ya se llamaba así antes de esta tarea); renombrar el punto de
  entrada es un cambio de infraestructura aparte, no de esta ficha.
- `app/api/configuracion/horarios/route.ts` tiene un `findMany` sin `take`
  explícito, pero está acotado por `{ businessId, memberId }` (a lo sumo unas
  pocas filas por semana): no es el listado sin tope que señala la ficha
  (`configuracion/servicios`), así que no lo toqué.

## Decisiones tomadas

- Se limita por actor y no sólo por IP: en un negocio con wifi compartido, la IP
  identifica al local, no a la persona.
- **El límite se centraliza en `middleware.ts`, no en cada handler.** Es una
  lista de EXCEPCIONES (`PREFIJOS_SIN_LIMITE_DE_PANEL`), no de endpoints
  cubiertos: todo lo que cuelga de `/api/*` queda limitado por sesión *por
  defecto*. Un endpoint nuevo no necesita que nadie se acuerde de nada; para
  sacarlo del límite hay que agregarlo a la lista a propósito, visible en el
  diff. Mismo espíritu que `whereDeAgenda` (F-006) y `HtmlSeguro`/`AsuntoSeguro`
  (F-009/F-013): el camino fácil es el seguro.
- Se separan dos tipos de límite, `panelLectura` (200/min) y `panelEscritura`
  (60/min), según el método HTTP (`GET`/`HEAD` vs el resto). Sigue el punto de
  partida de `seguridad/03-rate-limiting.md` (lectura más permisiva que
  escritura) pero bastante más alto que sus valores de referencia (100/20 por
  minuto), porque el panel puede disparar varias llamadas en paralelo al
  cargar una vista (calendario + stats + chats) y un límite ajustado se
  hubiera terminado desactivando a mano.
- La clave es `usuario:<id de sesión>` (o `ip:<ip>` si no hay token, para no
  dejar la petición sin ningún tope): dos personas del mismo negocio, misma
  IP, no comparten cupo.

## Bitácora

- **2026-09-06 — backend.** Rate limit en los endpoints autenticados del panel
  (`citas`, `pacientes`, `configuracion/*`, `equipo` salvo la invitación por
  token, `chats`, `dashboard/stats`), más los dos incumplimientos chicos
  detectados al pasar.
  - `middleware.ts`: el matcher pasa de una lista fija de rutas a
    `/api/:path*` (además de `/dashboard/:path*` y `/completar-perfil`, sin
    cambios). Dentro, `esRutaDePanel(pathname)` decide con una lista de
    EXCEPCIONES (`PREFIJOS_SIN_LIMITE_DE_PANEL`: `/api/auth`, `/api/cron`,
    `/api/reservar`, `/api/equipo/invitacion`) en vez de una lista de
    endpoints a cubrir — el motivo está en "Decisiones tomadas". Cualquier
    endpoint que no esté en la lista de excepciones queda limitado por sesión
    sin que su propio handler tenga que hacer nada.
  - Clave: `usuario:<token.id>` (el id de usuario de la sesión JWT, ya
    disponible en el middleware vía `getToken`), con fallback a `ip:<ip>` si
    no hay token (el handler igual responde 401, pero la petición no queda
    sin ningún tope).
  - Tipo de límite según método: `GET`/`HEAD` → `panelLectura` (200/min),
    el resto → `panelEscritura` (60/min).
  - Se preservó intacta la lógica que ya existía: el límite de `login` sobre
    `/api/auth/callback/credentials` sigue igual, y el redirect a
    `/iniciar-sesion`/`/completar-perfil` para las páginas del panel también
    (ahora explícitamente separado del branch de `/api`, para no redirigir un
    endpoint JSON como `/api/auth/session`).
  - `lib/rate-limit.ts`: se agregaron los tipos `panelLectura` y
    `panelEscritura` al `Record<TipoLimite, Ratelimit | null>` existente, sin
    tocar `verificarLimite` ni el comportamiento fail-open/fail-closed que fijó
    F-010.
  - `app/api/configuracion/servicios/route.ts`: se agregó `take: 200` al
    listado de servicios, que no tenía tope.
  - `app/api/pacientes/route.ts`: el `POST` pasó de `session.user.businessId`
    a `actorDeSesion(session)`, igual que el `GET` del mismo archivo.
  - Tests nuevos en `middleware.test.ts` (10 casos): 429 con mensaje legible
    (y sin fugas de detalles de Upstash), clave por sesión y no por IP, dos
    sesiones distintas no comparten clave, tipo de límite según método,
    exclusión de `/api/auth`, `/api/cron`, `/api/reservar` y
    `/api/equipo/invitacion`, y fallback a IP sin sesión.
  - Verificado: `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (14
    archivos, 151 tests) y `npm run build`, los cuatro en verde.


### Cierre — verificación del orquestador

El cambio toca el **middleware**, que corre en toda ruta que matchee: el radio de
daño de un error ahí es la aplicación entera, así que no alcanzaba con los tests.
Se levantó la app con la base local y se comprobó contra el navegador:

```
✓ login OK, llegó al dashboard
  /api/dashboard/stats → 200
  /api/citas → 200
  /api/pacientes → 200
  /api/equipo → 200
  /api/auth/session → 200 application/json
  30 llamadas seguidas → códigos 200
```

Las dos cosas que podían romperse y no se rompieron: **el login** (el matcher
ahora cubre `/api/:path*`, así que el middleware pasa por
`/api/auth/callback/credentials`) y **`/api/auth/session`**, que devuelve JSON y
no un redirect a HTML — el `return NextResponse.next()` para `/api/*` antes de la
lógica de redirección es justo lo que lo evita.

**Lo que no se pudo verificar en vivo:** que el 429 efectivamente se dispare.
Sin Upstash configurado y fuera de producción el límite deja pasar, por diseño de
F-010; por eso las 30 llamadas seguidas dan 200. Esa parte está cubierta por los
10 casos de `middleware.test.ts` y habrá que confirmarla en el primer despliegue
con Upstash real.

`@upstash/redis` y `@upstash/ratelimit` son clientes REST, así que funcionan en
el runtime del middleware; `lib/rate-limit.ts` no importa nada de Node.
