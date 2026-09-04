---
id: F-008
titulo: Cada número dice de dónde salió
estado: en-progreso
prioridad: alta
areas: [backend, frontend]
rama: v1
estimacion: media
max_iteraciones: 3
---

# F-008 — Cada número dice de dónde salió

## Problema

Dirección **C** de la propuesta de identidad, aprobada. La credibilidad no se
consigue sólo sacando mentiras —eso fue F-007— sino haciendo que **cada cifra
visible se explique**.

Hoy el panel muestra cuatro tarjetas con un número grande y, debajo, una línea
que dice `+0% vs mes anterior`. Tres problemas, en orden de gravedad:

1. **La comparación no compara lo mismo.** `app/api/dashboard/stats/route.ts`
   calcula la tendencia de citas como `citasHoyCount` contra
   `citasMesAnteriorCount`: **las citas de hoy contra el total del mes pasado**.
   Un día contra un mes. El número está definido matemáticamente y no significa
   nada.
2. **La tasa de ocupación se mide contra una capacidad inventada.** La fórmula
   es `citasTotalesMes / (diasMes * 8)`. Ese **8 citas por día** no sale de
   ningún lado: no lo configuró el negocio, no depende del horario ni de la
   duración de los servicios. Es exactamente el tipo de dato que F-007 vino a
   eliminar, escondido dentro de un cálculo.
3. **Cuando no hay historial, la tendencia se rellena con `0`** y la tarjeta
   muestra `+0% vs mes anterior`, que se lee como un placeholder roto. Un
   negocio de dos días de vida abre el panel y le parece que el sistema falla.

## Alcance

**Incluye:**
- Cada tarjeta del panel lleva una línea que dice **de qué está hecha** la cifra.
- Se va `+0% vs mes anterior` en su forma actual.
- Se corrige o se saca la comparación que no compara lo mismo.
- Se corrige o se saca la tasa de ocupación con capacidad inventada.
- Un estado vacío honesto cuando todavía no hay historial.

**NO incluye:**
- La dirección **A** (el panel como línea de tiempo del día). Es la ficha
  siguiente y toca la estructura, no las cifras.
- Rediseñar la barra lateral, el calendario ni ninguna otra pantalla.
- Nuevos modelos de datos. Si un contexto no se puede sacar de lo que ya existe,
  **no se muestra** en vez de inventarlo.

## Criterios de aceptación

- [ ] Ninguna tarjeta del panel muestra una cifra sin una línea que la explique,
      salvo que no haya nada verdadero que decir — en cuyo caso no muestra
      ninguna línea, tampoco una de relleno.
- [ ] La línea de contexto sale de datos reales del negocio. Si hace falta un
      dato que el endpoint no devuelve, se agrega al endpoint; si no se puede
      calcular con el esquema actual, se omite y se anota.
- [ ] **No queda ninguna comparación entre magnitudes distintas.** O se compara
      hoy contra el mismo día del mes pasado, o mes contra mes, o no se compara.
- [ ] **La tasa de ocupación no usa una capacidad inventada.** O se calcula
      contra el horario real del negocio (`WorkSchedule` ya existe) y la duración
      de los servicios, o se saca la tarjeta. Sacarla es una respuesta válida.
- [ ] Sin historial suficiente, el panel lo dice con palabras en vez de mostrar
      `0%`.
- [ ] Un `worker` sigue sin ver ingresos (F-006 no se rompe).
- [ ] Tests del endpoint que fijen: sin mes anterior no viaja tendencia; el
      contexto de cada cifra sale de los datos y no de un valor por defecto.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | backend | Arreglar las cifras y devolver el contexto de cada una | backend | pendiente | — |
| 2 | frontend | La tarjeta muestra procedencia en vez de tendencia | frontend | pendiente | 1 |
| 3 | qa | Verificar que ninguna cifra visible sea injustificable | qa | pendiente | 1,2 |

## Contexto técnico

- `app/api/dashboard/stats/route.ts` — las tres cifras y las tendencias.
- `components/app/tarjetas/tarjeta-estadistica.tsx` — el `+X% vs mes anterior`
  vive acá, en el prop `tendencia`.
- `app/dashboard/page.tsx` — arma las tarjetas.
- **F-006 no se rompe:** cuando `puedeVerIngresosDelNegocio` es `false`, las
  claves de ingresos no viajan. El contexto nuevo tiene que respetar lo mismo.
- `WorkSchedule` (`prisma/schema.prisma`) tiene `dayOfWeek`, `startTime`,
  `endTime` por negocio y por miembro: ahí está la capacidad real, si se decide
  calcularla.
- Ejemplos de la propuesta aprobada, como referencia de tono —no de literal—:
  «Domingo. La próxima es mañana 10:00», «María González, desde el 29 de
  agosto», «1 cita confirmada. Aún no completada».

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

- Preferimos no mostrar una línea antes que mostrar una vaga. «Sin cambios
  respecto al mes pasado» cuando no hay mes pasado es la misma mentira que
  `+0%`, con más palabras.
- Sacar una métrica es una respuesta legítima. Una tarjeta menos es mejor que
  una tarjeta que miente.

## Bitácora
