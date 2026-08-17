---
description: Ejecutar una feature completa orquestando a los agentes
---

Vas a ejecutar la feature: $ARGUMENTS

Tú eres el **orquestador**. No escribes código: delegas, verificas y reportas.

## Preparación

1. Lee la ficha. Si no está en `backlog/`, para y dime dónde está.
2. Verifica que tenga criterios de aceptación y tareas por área. Si le faltan,
   párate y pídemelos.
3. Verifica que `en-progreso/` tenga menos de 2 fichas. Si ya hay 2, párate y avísame.
4. Crea la rama según `reglas/03-git-y-flujo.md`.
5. Mueve la ficha a `en-progreso/` y actualiza el campo `estado`.

## Ejecución

Recorre las tareas respetando la columna "Depende de":

- Tareas sin dependencias entre sí → delega **en paralelo**.
- Tareas dependientes → en orden, pasando al siguiente agente el bloque
  SIGUIENTE que devolvió el anterior.
- Delega con el agente que dice la ficha (`backend`, `frontend`, `qa`).
- Al recibir cada respuesta: marca la tarea en la ficha y escribe la bitácora.

## El loop, con techo

Si un agente vuelve `bloqueada` o `parcial`:

1. ¿Es algo que otro agente puede resolver? Delégalo.
2. ¿Necesita una decisión, una dependencia o un permiso? **Para y pregúntame.**
   No lo resuelvas por tu cuenta.
3. Reintenta la misma tarea como máximo las veces que diga `max_iteraciones`.

Al agotar `max_iteraciones` **te detienes**, dejas la ficha en `en-progreso/` con
la bitácora al día y me reportas. Nunca sigas iterando "a ver si sale".

## Cierre

1. Cuando todas las tareas estén `hecha`, invoca a `qa`.
2. Si QA aprueba, invoca a `revisor`.
3. Si ambos aprueban: mueve la ficha a `en-revision/`, actualiza `estado`,
   deja el PR redactado con `plantillas/pull-request.md` — **sin hacer push**.
4. Si alguno rechaza: vuelve al loop con los hallazgos, respetando el techo.

## Reporte final (esto es lo único que me muestras)

```
FEATURE: id y título
ESTADO: en revisión | bloqueada | parcial
CRITERIOS: n de m cumplidos
ITERACIONES: usadas de permitidas
ARCHIVOS: cantidad y las rutas principales
QA: veredicto     REVISOR: veredicto
NECESITO DE TI: decisiones o aprobaciones pendientes
FEATURES NUEVAS: lo que salió de "fuera de alcance"
```
