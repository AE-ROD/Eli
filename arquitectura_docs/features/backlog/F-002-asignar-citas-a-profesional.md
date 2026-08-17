---
id: F-002
titulo: Asignar citas a un profesional
estado: backlog
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

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

<!-- El agente registra acá las que surjan. -->

## Bitácora
