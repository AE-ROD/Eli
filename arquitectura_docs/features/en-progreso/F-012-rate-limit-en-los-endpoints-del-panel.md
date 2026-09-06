---
id: F-012
titulo: Rate limit en los endpoints del panel
estado: en-progreso
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

- [ ] Los endpoints autenticados del panel aplican rate limit.
- [ ] **El límite se cuenta por sesión, no sólo por IP.** Varias personas del
      mismo negocio salen por la misma IP —un salón con wifi compartido— y no
      pueden gastarse el cupo entre ellas. Usá algo del actor como clave.
- [ ] Los límites de un panel son **mucho más altos** que los de login: un
      calendario legítimo dispara varias consultas por minuto. Un límite que
      moleste al uso normal se termina sacando, que es peor que no tenerlo.
- [ ] Un 429 devuelve un mensaje que se entienda, no un error crudo.
- [ ] Ningún listado queda sin `take`.
- [ ] `POST /api/pacientes` usa `actorDeSesion` como el resto del archivo.
- [ ] Tests que fijen que un endpoint del panel responde 429 al pasarse.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

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

<!-- El agente completa acá. -->

## Decisiones tomadas

- Se limita por actor y no sólo por IP: en un negocio con wifi compartido, la IP
  identifica al local, no a la persona.

## Bitácora
