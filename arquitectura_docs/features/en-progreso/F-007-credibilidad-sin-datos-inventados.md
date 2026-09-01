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
| 1 | frontend | Sacar los tres datos inventados | frontend | completada | — |
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

- **`precios-section.tsx:107`** — "Miles de profesionales ya dejaron de coordinar
  citas por WhatsApp" es otra cifra de adopción falsa (cero clientes hoy). Está
  fuera de la tarea #1 tal como está escrita (el contexto técnico sólo menciona
  hero y barra lateral), pero cae dentro del criterio de aceptación "buscar en
  toda la landing" y del mismo patrón de la ficha, así que la corregí en el
  mismo barrido: pasó a "Dejá de coordinar citas por WhatsApp. Empieza gratis 3
  días, sin tarjeta." — sin afirmar tracción.
- **Badge de "Ahorra hasta 32%" en `precios-section.tsx`**: lo revisé porque
  parece una cifra de marketing, pero es un cálculo real hecho a partir de los
  precios definidos en el propio archivo (`(mensual*12 - anual) / (mensual*12)`,
  máximo en el plan Pro: 229/708 ≈ 32%). No es un dato inventado y tocar precios
  no es parte de esta tarea, así que se deja igual.
- **Badge de Chats sin número**: contar conversaciones reales (o no leídas)
  requeriría backend nuevo. El modelo `Message` no tiene un campo de "leído"
  (`prisma/schema.prisma`, `model Message`), así que no hay forma de calcular
  "no leídos" hoy. `GET /api/chats` sólo devuelve la lista de conversaciones, no
  un conteo de pendientes. Si el producto quiere un badge real, hace falta:
  (a) decidir qué cuenta (conversaciones totales vs. mensajes sin leer) y
  (b) si es lo segundo, agregar el campo `read`/`readAt` al modelo `Message` y
  el endpoint o cómputo correspondiente. Por ahora el ítem de Chats no muestra
  ningún número.
- No toqué `app/dashboard/page.tsx` ni `components/landing/dashboard-preview-section.tsx`
  (la maqueta usa "Mi Negocio" y nombres de ejemplo genéricos tipo "María G.",
  "Carlos R." en una vista de calendario ilustrativa — no se lee como el
  negocio de un cliente real, así que no ameritaba aclaración adicional).

## Decisiones tomadas

- Preferimos un hueco antes que un número inventado. Sin clientes todavía, la
  credibilidad se construye mostrando el producto, no afirmando tracción.

## Bitácora

### Tarea 1 (frontend) — completada

**Archivos modificados:**
- `components/landing/hero-section.tsx`
- `components/app/layout/barra-lateral.tsx`
- `components/landing/precios-section.tsx`

**Qué se sacó y qué se puso en su lugar:**

1. `hero-section.tsx` — se sacó por completo el bloque "Social proof": la pila
   de 5 avatares inventados (`AVATARS`), las 5 estrellas fijas y el texto
   "+1,200 negocios confían en Eli" (cero negocios reales hoy). En su lugar va
   una línea con el diferenciador real del producto, tomado de
   `docs/PRODUCTO.md` §2 (el reparto de comisiones, "el centro del producto"):
   *"La comisión de cada profesional se calcula sola al completar la cita, sin
   planillas a fin de mes."* Es cierto y verificable: así es como funciona hoy
   (`Appointment.commissionPercent/Amount/At` se congela al completar la cita),
   no es una cifra de adopción ni una promesa vaga.
2. `barra-lateral.tsx` — se sacó `notificaciones: 3` del ítem de Chats y el
   bloque JSX que pintaba el badge numérico. Se revisó `GET /api/chats`
   (`app/api/chats/route.ts`) y el modelo `Message` en `prisma/schema.prisma`:
   no existe ningún campo de "leído", así que no hay manera de contar algo real
   sin tocar backend. Siguiendo la instrucción de la ficha, no se inventó un
   conteo (ej. total de conversaciones) que se leería como notificaciones sin
   serlo: el ítem de Chats ya no muestra número.
3. `barra-lateral.tsx` — se sacó `usuarioDefault` ("María García" / "Salón
   María"). Ahora, sin `usuario` (sesión no cargada), el pie de la barra
   lateral no inventa nombre ni negocio: muestra un ícono genérico de usuario
   y el texto "Sesión no disponible" en vez del nombre/negocio.
4. Barrido del resto de la landing: se encontró una cuarta cifra de adopción
   falsa en `precios-section.tsx:107` ("Miles de profesionales ya dejaron de
   coordinar citas por WhatsApp") y se reemplazó por un texto sin afirmar
   tracción. Detalle y lo que se dejó igual (el "Ahorra hasta 32%", que es un
   cálculo real de precios) en "Fuera de alcance detectado".

**Verificación:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (86
tests, 9 archivos) y `npm run build` — los cuatro en verde.
