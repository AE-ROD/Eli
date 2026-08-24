---
id: F-004
titulo: Cerrar la toma de cuenta por invitación
estado: en-progreso
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

- [ ] `GET /api/equipo` y `POST /api/equipo` usan `select` explícito y **no**
      devuelven `token` en ningún caso.
- [ ] Aceptar una invitación con un email que **ya tiene cuenta** no modifica su
      `password` ni su `name`. Sólo se crea la membresía.
- [ ] Ese caso exige que la persona ya haya iniciado sesión, y que la sesión
      corresponda al email de la invitación. Si no, no se crea nada.
- [ ] Aceptar una invitación de un email **sin cuenta** sigue funcionando igual
      que hoy: crea el usuario con la contraseña que eligió y la membresía.
- [ ] Una invitación ya aceptada o vencida sigue devolviendo 410.
- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | backend | Cerrar las dos filtraciones | backend | pendiente | — |
| 2 | revisor | Confirmar que el ataque ya no corre | revisor | pendiente | 1 |

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

<!-- El agente completa acá. -->

## Decisiones tomadas

- Una invitación no es un mecanismo de recuperación de contraseña. Para eso ya
  existe el flujo de `/recuperar-contrasena`.

## Bitácora
