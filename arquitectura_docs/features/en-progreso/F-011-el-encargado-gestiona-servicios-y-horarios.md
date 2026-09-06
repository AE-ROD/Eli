---
id: F-011
titulo: El encargado gestiona servicios y horarios
estado: en-progreso
prioridad: alta
areas: [backend, frontend]
rama: v1
estimacion: media
max_iteraciones: 3
---

# F-011 — El encargado gestiona servicios y horarios

## Problema

F-005 hizo que el encargado gestione el equipo. Pero la página de configuración
sigue repartiendo todo con su propio `esOwner`, así que **el encargado todavía no
gestiona servicios ni horarios de otros**, aunque `puedeGestionarServicios` y
`puedeEditarHorarioDe` en `lib/permisos.ts` digan hace rato que puede.

Es el mismo problema que F-005 sacó de `/api/equipo`, en la pantalla de al lado:
la regla vive en `lib/` y la pantalla la reimplementa a mano.

Peor: `app/api/configuracion/horarios/route.ts` tiene su propio
`resolverMemberId()`, que es **owner-only** y quedó desactualizado respecto de
`puedeEditarHorarioDe()`. Hoy trata al encargado igual que a un profesional
—sólo su propio horario— cuando la regla del producto (`docs/PRODUCTO.md` §5)
dice que el encargado edita el de cualquiera.

## Alcance

**Incluye:**
- `app/dashboard/configuracion/page.tsx` decide con `lib/permisos.ts`, no con un
  `esOwner` propio.
- Los endpoints de servicios y horarios preguntan a `lib/permisos.ts`.
- El encargado gestiona servicios y edita el horario de cualquier miembro.

**NO incluye:**
- El dinero: comisiones y facturación siguen siendo sólo del dueño
  (`puedeEditarComisiones`). Es el límite del encargado.
- Rediseñar la pantalla de configuración.
- El rate limit de esos endpoints (F-012).

## Criterios de aceptación

- [ ] Un `admin` ve y usa la sección de servicios en configuración.
- [ ] Un `admin` edita el horario de cualquier miembro del negocio y el horario
      general; un `worker` sigue editando sólo el propio.
- [ ] Un `worker` no ve la sección de servicios.
- [ ] Ningún archivo tocado compara roles a mano ni usa `session.user as any`
      para autorizar.
- [ ] **Aislamiento intacto:** ningún miembro de otro negocio es alcanzable;
      404, nunca 403.
- [ ] Tests de endpoint que fijen quién entra y quién no en servicios y horarios.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- `app/dashboard/configuracion/page.tsx` — el `esOwner` reparte seis decisiones.
- `app/api/configuracion/servicios/route.ts` y `.../servicios/[id]/route.ts`.
- `app/api/configuracion/horarios/route.ts` — el `resolverMemberId()` owner-only.
- `lib/permisos.ts` ya tiene `puedeGestionarServicios` y `puedeEditarHorarioDe`.
  `puedeEditarHorarioDe` recibe `Miembro { id, businessId }`, no un id suelto: es
  lo que impide alcanzar a alguien de otro negocio.
- `app/api/equipo/route.ts` es el ejemplo a copiar: así quedó tras F-005.
- **Es un cambio de comportamiento esperado, no una regresión.** El `admin` gana
  acceso que hoy no tiene, y eso es corregir la pantalla para que siga la regla
  real del producto (ya estaba anotado en F-001).

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

- El límite del encargado es el dinero, no la operación (`docs/PRODUCTO.md` §5).
  Servicios y horarios son operación.

## Bitácora
