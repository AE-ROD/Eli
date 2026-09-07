---
id: F-015
titulo: El precio también en Decimal
estado: backlog
prioridad: media
areas: [backend, datos, frontend]
rama: por definir
estimacion: media
max_iteraciones: 3
---

# F-015 — El precio también en Decimal

## Problema

F-003 pasó `commissionAmount` a `Decimal` porque el dinero en punto flotante
acumula errores de redondeo, y en una liquidación mensual esos errores se suman
sobre decenas de citas — o sea, disputas con gente que cobra por su trabajo.

Pero `Appointment.price` y `Service.price` siguen siendo `Float`. Quedan **dos
tipos distintos para dinero en el mismo esquema**, y la comisión se calcula
justamente sobre el precio: `commissionAmount = price × percent / 100`. Un
`Decimal` calculado a partir de un `Float` hereda el error del `Float`; la
precisión del resultado no puede ser mejor que la de su insumo.

No se hizo junto con F-003 por una razón concreta, no por falta de tiempo:
`commissionAmount` tenía cero filas y esa ventana no se repite. `price` ya tiene
datos en producción, así que hacerlo ahora **no es más barato que hacerlo
después**. Lo que sí conviene es hacerlo antes de que existan liquidaciones
reales que dependan de esos números.

## Alcance

**Incluye:**
- `Appointment.price` y `Service.price` pasan a `Decimal`.
- Los 43 lugares del código que hoy los tratan como `number`.
- La migración, probada sobre una base **con datos**, no vacía.

**NO incluye:**
- Cambiar cómo se muestran los precios. El formato de salida se mantiene.
- Aplicar la migración en Neon.

## Criterios de aceptación

- [ ] `Appointment.price` y `Service.price` son `Decimal` con precisión y escala
      explícitas, coherentes con `commissionAmount`.
- [ ] Ningún cálculo de dinero pasa por `number` en el camino: sumar, multiplicar
      y comparar se hacen sobre `Decimal`. Convertir a `number` sólo al
      serializar para la vista.
- [ ] Los importes se ven **exactamente igual** que hoy en el panel, la landing y
      los correos.
- [ ] `GET /api/dashboard/stats` sigue devolviendo los ingresos con el mismo
      contrato: la clave no viaja si el actor no puede verla (F-006/F-008).
- [ ] **La migración se prueba sobre una copia de la base local con datos
      cargados**, no sobre una vacía: es una conversión de tipo con `USING`, y lo
      que hay que demostrar es que no pierde ni redondea valores existentes.
- [ ] Los tests que hoy comparan importes con `toBe(1000)` siguen pasando, o se
      actualizan a propósito y queda escrito por qué.
- [ ] `npx prisma validate`, `npm run lint`, `npx tsc --noEmit`, `npm test` y
      `npm run build` en verde.

## Contexto técnico

- 43 usos de `price` en `app/`, `lib/`, `components/` y `prisma/seed.ts`.
- Los que más duelen: `_sum.price` en `app/api/dashboard/stats/route.ts` pasa a
  ser `Prisma.Decimal | null`, y los `toLocaleString("es-ES")` de la vista dejan
  de funcionar sobre un `Decimal` sin convertir.
- Los `z.number()` de los endpoints siguen recibiendo números por JSON: la
  conversión va en el borde, al escribir, no en el schema de entrada.
- **La conversión reescribe la tabla y toma un lock.** `citas` en producción
  tiene datos; conviene medir cuántas filas antes de aplicar.

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

- Se separa de F-003 a propósito. La ventana de "cero filas" que hacía urgente el
  cambio en `commissionAmount` no aplica acá, y mezclar una conversión de tipo
  sobre datos de producción con el modelo nuevo habría hecho ambas cosas más
  riesgosas de revisar.

## Bitácora
