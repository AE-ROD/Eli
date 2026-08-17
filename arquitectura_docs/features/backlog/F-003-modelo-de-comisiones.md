---
id: F-003
titulo: Modelo de datos de comisiones
estado: backlog
prioridad: alta
areas: [backend, datos]
rama: v1
estimacion: media
max_iteraciones: 3
---

# F-003 — Modelo de datos de comisiones

## Problema

Las comisiones son **el diferenciador del producto** (`docs/PRODUCTO.md` §2) y hoy
no existe nada en el esquema: ni porcentaje por profesional, ni excepciones por
servicio, ni registro de lo liquidado.

Es la base de todo el bloque de comisiones. Se hace primero y bien, porque
corregir un modelo de datos con registros ya cargados obliga a migrar.

## Alcance

**Incluye:**
- Porcentaje por defecto en el profesional.
- Excepción por profesional × servicio.
- Campos de comisión congelada en la cita.
- Tabla de auditoría de cambios de porcentaje.
- Archivo de migración SQL.

**NO incluye:**
- Interfaz de configuración (F-004).
- El cálculo al completar la cita (F-005).
- **Aplicar la migración**: la única base configurada es producción y está
  bloqueada por permisos. El agente deja el `.sql` listo y reporta.

## Criterios de aceptación

- [ ] `BusinessMember.commissionPercent Float?` — porcentaje por defecto (0–100).
- [ ] Modelo `CommissionRate` con `(memberId, serviceId, percent)` y **unicidad**
      sobre el par: no puede haber dos porcentajes para la misma combinación.
- [ ] `Appointment` suma `commissionPercent`, `commissionAmount` y `commissionAt`,
      todos opcionales.
- [ ] Modelo `CommissionChange` con quién, cuándo, valor anterior y nuevo.
- [ ] Todos los modelos nuevos llevan `businessId` e índice por él.
- [ ] Nombres de tabla en español vía `@@map`, como el resto del esquema.
- [ ] Existe la migración en `prisma/migrations/`.
- [ ] `npx prisma validate` pasa. `npx tsc --noEmit` y `npm test` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | datos | Modelos en `schema.prisma` + migración SQL | backend | pendiente | — |
| 2 | revisor | Verificar aislamiento e integridad del modelo | revisor | pendiente | 1 |

## Contexto técnico

**Reglas de negocio que el modelo debe hacer posibles** (`docs/PRODUCTO.md` §3):

1. **Cascada:** porcentaje de ese profesional en ese servicio → porcentaje por
   defecto del profesional → sin configurar.
2. **Sin configurar no es cero.** La cita queda pendiente de configurar. El modelo
   debe poder distinguir "0%" de "todavía no configurado" — por eso los campos son
   opcionales y no tienen valor por defecto.
3. **Congelado:** al completarse la cita se guardan el porcentaje y el monto
   aplicados. Nunca se recalculan. Cambiar un porcentaje hoy no puede alterar
   liquidaciones ya cerradas.
4. Se calcula sobre el **precio total**, sin descontar insumos.

**Riesgo documentado:** no contemplar descuento de materiales. Si aparecen negocios
con insumos caros habrá que migrar. Aceptado para v1 (`docs/PRODUCTO.md` §3.2).

**Restricción del entorno:** `migrate deploy`, `db push`, `db execute` y
`migrate reset` están bloqueados. No intentar aplicar la migración.

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

- Modelo profesional × servicio **con herencia**, no matriz obligatoria: el dueño
  configura un porcentaje por persona y sólo define excepciones donde las haya.

## Bitácora
