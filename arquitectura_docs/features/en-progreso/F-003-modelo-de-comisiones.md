---
id: F-003
titulo: Modelo de datos de comisiones
estado: en-progreso
prioridad: alta
areas: [backend, datos]
rama: f-003-comisiones
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
- **Aplicar la migración en producción.** Sí se aplica y se prueba en la base
  local (ver "Contexto técnico"): es la única forma de saber que el `.sql`
  funciona antes de que toque datos reales.

## Criterios de aceptación

- [x] `BusinessMember.commissionPercent Float?` — porcentaje por defecto (0–100).
- [x] Modelo `CommissionRate` con `(memberId, serviceId, percent)` y **unicidad**
      sobre el par: no puede haber dos porcentajes para la misma combinación.
- [x] `Appointment` suma `commissionPercent`, `commissionAmount` y `commissionAt`,
      todos opcionales.
- [x] Modelo `CommissionChange` con quién, cuándo, valor anterior y nuevo.
- [x] Todos los modelos nuevos llevan `businessId` e índice por él.
- [x] Nombres de tabla en español vía `@@map`, como el resto del esquema.
- [x] Existe la migración en `prisma/migrations/`.
- [x] **La migración se aplica limpia sobre la base local** y el cliente de
      Prisma se regenera sin errores. Una migración que nadie corrió no está
      terminada: es un archivo que esperamos que funcione.
- [x] Aplicada la migración, el seed sigue corriendo y la app sigue levantando.
- [x] `npx prisma validate` pasa. `npx tsc --noEmit` y `npm test` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | datos | Modelos en `schema.prisma` + migración SQL | backend | completada | — |
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

**Base local, novedad respecto de cuando se escribió esta ficha:** ya hay un
Postgres local con el esquema y el seed cargados (`README.md`, sección "Una base
de desarrollo"). Corre en el puerto 5433, base `eli`. Ahí **sí** se aplica la
migración, con `psql`:

```bash
psql -h /tmp -p 5433 -U postgres -d eli -v ON_ERROR_STOP=1 -f prisma/migrations/<nueva>/migration.sql
```

**Contra producción no se toca nada.** `migrate deploy`, `db push`, `db execute`
y `migrate reset` siguen bloqueados por permisos, y `DATABASE_URL` apunta a Neon.
Usá `psql` contra localhost:5433, nunca Prisma contra la URL del `.env`.

## Fuera de alcance detectado

- No existe todavía ningún endpoint ni componente que use estos modelos (correcto,
  es F-004/F-005). No se tocó `lib/permisos.ts` ni `app/api/`.
- El local de Postgres (puerto 5433) estaba apagado al empezar (quedó un
  `postmaster.pid` de una sesión anterior con el socket en `/tmp` pero sin proceso
  vivo). Se relevantó con `pg_ctl -D /var/lib/postgresql/eli -o '-p 5433
  -c unix_socket_directories=/tmp'` para que quedara igual que antes. No es algo
  para arreglar en esta tarea, sólo lo dejo anotado por si otro agente se
  encuentra con el mismo "connection refused".
- Esa base local no tiene tabla `_prisma_migrations` (el esquema se cargó por
  fuera de `migrate dev` en algún momento). Por eso `prisma migrate dev
  --create-only` no sirve ahí — Prisma la ve como "no migrada" y pide resetearla.
  Se generó el SQL con `prisma migrate diff` (sólo lectura, compara contra la
  base real) y se aplicó a mano con `psql`, como pide la ficha.

## Decisiones tomadas

- Modelo profesional × servicio **con herencia**, no matriz obligatoria: el dueño
  configura un porcentaje por persona y sólo define excepciones donde las haya.
- `CommissionChange.changedBy` referencia a `User`, no a `BusinessMember`: sólo el
  dueño puede tocar comisiones (`puedeEditarComisiones = esDueño` en
  `lib/permisos.ts`) y el dueño no necesariamente tiene fila de miembro.
- `CommissionChange.serviceId` es opcional y discrimina el tipo de cambio: `null`
  = cambio al porcentaje por defecto del profesional, con valor = cambio a una
  excepción puntual. Así no hace falta un campo `tipo` aparte.
- Se agregaron `CHECK` constraints a nivel de Postgres (0–100) en
  `commissionPercent` (`miembros_negocio`, `citas`), `percent`
  (`porcentajes_comision`) y `previousPercent`/`newPercent`
  (`cambios_comision`), todos permitiendo `NULL`. No estaba pedido explícitamente,
  pero el criterio de aceptación fija el rango 0–100 y esto es dinero de terceros:
  vale la pena que la base lo garantice y no sólo la validación de Zod que vendrá
  en F-004. Quien siga con `prisma migrate dev` en el futuro debe saber que estas
  constraints viven sólo en el SQL, no en `schema.prisma` (Prisma no soporta
  `@@check` en la versión de este proyecto): si alguien corre `migrate dev`
  después de tocar estos campos, revisar que no las borre por "drift".
- FKs: `businessId`, `memberId` y `serviceId` de `CommissionRate` son `Cascade`
  (una excepción sin su profesional, servicio o negocio no tiene sentido).
  `CommissionChange.serviceId` es `SetNull` (igual que `citas.serviceId`): si se
  borra un servicio, el historial de auditoría sobrevive pero pierde la
  referencia puntual.

## Bitácora

- Se agregaron los modelos `CommissionRate` (`porcentajes_comision`) y
  `CommissionChange` (`cambios_comision`), el campo `BusinessMember.commissionPercent`
  y los campos congelados `Appointment.commissionPercent/commissionAmount/commissionAt`.
  Todos opcionales y sin valor por defecto, según regla 2.
- Migración `prisma/migrations/20260907190000_add_commissions/migration.sql`,
  generada con `prisma migrate diff` contra la base local y aplicada con `psql`
  (ver comando en "Contexto técnico"). Aplicada limpia, sin errores.
- `npx prisma generate`, seed (`SEED_CONFIRMO=si npm run prisma:seed`), `npx tsc
  --noEmit`, `npm run lint`, `npx vitest run` (178 tests) y `npm run build`
  corridos contra la base local, todos en verde.
- No se tocó `.env`: todos los comandos locales se corrieron con
  `DATABASE_URL`/`DIRECT_URL` inline apuntando a
  `postgresql://postgres@localhost:5433/eli?schema=public`.
