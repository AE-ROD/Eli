---
id: F-007
titulo: Credibilidad — fuera los datos inventados
estado: en-progreso
prioridad: alta
areas: [frontend]
rama: v1
estimacion: chica
max_iteraciones: 3
---

# F-007 — Credibilidad: fuera los datos inventados

## Problema

El producto afirma cosas que no son ciertas. Con un cliente real delante, cada
una es una forma de perder la venta en el momento exacto en que la estabas
ganando.

Encontrado al correr el sistema:

1. **`components/landing/hero-section.tsx:142` — "+1,200 negocios confían en Eli"**,
   con cinco estrellas y una pila de avatares inventados. Son cero negocios. Es
   la peor: es verificable y es lo primero que ve alguien que llega.
2. **`components/app/layout/barra-lateral.tsx:28` — el badge de Chats está fijo
   en `notificaciones: 3`.** No cuenta nada: dice 3 aunque no haya ninguna
   conversación. En la demo aparecía un "3" al lado de Chats con la bandeja
   vacía.
3. **`barra-lateral.tsx:54-58` — `usuarioDefault`: "María García / Salón María".**
   Si la sesión no carga, la interfaz inventa un usuario y un negocio en vez de
   admitir que no sabe quién sos.

El eslogan es que trabajamos con el recurso más valioso, el tiempo. Una cifra
inflada dice lo contrario: que preferimos el atajo.

## Alcance

**Incluye:**
- Sacar la prueba social falsa del hero y poner en su lugar algo verdadero.
- Que el badge de Chats cuente conversaciones reales, o no exista.
- Que la barra lateral no invente un usuario cuando no hay sesión.

**NO incluye:**
- **`app/dashboard/page.tsx`**: lo está tocando F-006 ahora mismo. No entrar ahí.
- El rediseño visual del dashboard: es la etapa siguiente, con F-006 ya cerrada.
- `components/landing/dashboard-preview-section.tsx`: los datos de esa maqueta
  son una ilustración del producto, no un testimonio. Se deja, pero **no puede
  parecer el negocio de un cliente real**; si hace falta, se aclara que es un
  ejemplo.
- Las tendencias del dashboard (`+0% vs mes anterior`) **no son inventadas**:
  salen de `stats.tendencias`, calculado contra el mes anterior. Se quedan.

## Criterios de aceptación

- [ ] No queda ninguna cifra de adopción, testimonio, reseña ni valoración que
      no sea verificable. Buscar en toda la landing, no sólo en el hero.
- [ ] Lo que reemplace a la cifra dice algo cierto y concreto sobre el producto.
      Nada de rellenar el hueco con otra afirmación vaga.
- [ ] El badge de Chats refleja conversaciones reales; si eso no se puede
      resolver sin backend nuevo, **no se muestra ningún número**.
- [ ] Sin sesión, la barra lateral no muestra un nombre ni un negocio inventado.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | frontend | Sacar los tres datos inventados | frontend | pendiente | — |
| 2 | qa | Barrer la landing y el panel buscando los que queden | qa | pendiente | 1 |

## Contexto técnico

- `components/landing/hero-section.tsx` — la línea 142 y la pila de avatares y
  estrellas alrededor.
- `components/app/layout/barra-lateral.tsx` — `notificaciones: 3` en la lista de
  ítems, y `usuarioDefault`.
- El badge sale de un array estático de navegación; no hay endpoint que cuente
  conversaciones sin leer. Existe `GET /api/chats`, pero conviene mirar qué
  devuelve antes de decidir si alcanza.
- La barra lateral ya recibe `usuario` como prop desde `app/dashboard/layout.tsx`,
  armado con la sesión del servidor.

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

- Preferimos un hueco antes que un número inventado. Sin clientes todavía, la
  credibilidad se construye mostrando el producto, no afirmando tracción.

## Bitácora
