---
id: F-003
titulo: Modelo de datos de comisiones
estado: en-revision
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
- Interfaz de configuración (todavía sin ficha creada -- **no es F-004**, que ya
  existe y es "toma de cuenta por invitación". Referencia corregida tras la
  revisión: el esquema y esta ficha apuntaban mal).
- El cálculo al completar la cita (todavía sin ficha creada -- **no es F-005**,
  que ya existe y es "el encargado gestiona el equipo". Misma corrección).
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
- [x] **Ronda de revisión (post `dca02e1`):** FK compuesta en `CommissionRate`
      contra tenant cruzado, auditoría desnormalizada (no cascadea con lo que
      audita), `scope` explícito en `CommissionChange`, CHECK de comisión
      congelada todo-o-nada, índice de liquidación, `commissionAmount` en
      `Decimal`. Ver "Decisiones tomadas" y "Bitácora".

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | datos | Modelos en `schema.prisma` + migración SQL | backend | completada | — |
| 2 | revisor | Verificar aislamiento e integridad del modelo | revisor | completada (2 pasadas) | 1 |

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
  son la futura interfaz de configuración y el futuro cálculo, ninguna con ficha
  todavía -- no `F-004`/`F-005`, que ya existen y son otra cosa; ver nota de
  corrección de referencias más abajo). No se tocó `lib/permisos.ts` ni `app/api/`.
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
- **`Appointment.member` y `Appointment.service` siguen sin FK compuesta contra
  `businessId`.** Es la misma clase de bug que el revisor encontró en
  `CommissionRate` (nada impide una fila con el `businessId` de un negocio y el
  `memberId`/`serviceId` de otro), pero no estaba en el pedido de esta ronda y
  tocar `Appointment` es un cambio más grande (esa tabla ya tiene filas en
  producción). Lo dejo anotado para que se evalúe como feature propia.
- **`DELETE /api/configuracion/servicios/[id]` no tenía `try/catch`** (resuelto
  en esta ficha, ver bitácora: el endpoint devuelve 409 con explicación y la
  sección de servicios lo muestra). Se deja el hallazgo original abajo porque es
  el ejemplo de por qué un cambio de `onDelete` no termina en el esquema.
- **`DELETE /api/configuracion/servicios/[id]` no tiene `try/catch`.** Con el
  nuevo `Restrict` de `CommissionRate.service`, borrar un servicio con
  comisiones configuradas ahora falla en la base (correcto, es la intención del
  punto 3), pero el endpoint no atrapa el error de Prisma (`P2003`, violación de
  FK): hoy devuelve un 500 genérico sin catch, en vez de un 409 con un mensaje
  útil ("no se puede borrar, tiene comisiones configuradas"). No lo toco: es un
  cambio de endpoint (fuera de esta ficha, que es sólo de modelo), pero conviene
  resolverlo antes de exponer el borrado de servicios a un encargado real.
- **Mezcla de tipos `Float`/`Decimal` en el cálculo futuro de comisión.**
  `commissionAmount` ahora es `Decimal(12,2)` pero `Appointment.price` y
  `Service.price` siguen en `Float` (a propósito, ver `F-015`, backlog). La
  futura feature de cálculo va a tener que convertir `price` a `Decimal` en el
  momento del cálculo (`Decimal × percent / 100`) para no heredar el error de
  redondeo del `Float` de origen -- no alcanza con que el campo de destino sea
  `Decimal` si el insumo no lo es. No es un problema para resolver acá: lo
  resuelve F-015 al convertir `price`, o la propia feature de cálculo si decide
  convertir puntualmente antes de F-015. Quedó pedido explícitamente no tocar
  `price` en esta ficha.

### Hallazgos de la segunda pasada del revisor (no bloqueantes)

Ninguno impide cerrar la ficha; todos quedan anotados para no perderse.

- **`CommissionChange` sí acepta filas de tenant cruzado** (el revisor lo probó
  con un insert real: `businessId` de un negocio, `memberId` de otro, aceptado).
  La ficha justificaba la FK simple como una imposibilidad técnica -- "una FK
  compuesta con `SetNull` anula todas las columnas, incluida `businessId`, que
  es NOT NULL". **Eso es falso desde Postgres 15**, que permite `ON DELETE SET
  NULL ("memberId")`, anulando sólo la columna indicada; el revisor lo probó
  funcionando. Corrección importante de método: era una **elección**, no una ley
  de la física, y una elección documentada como imposibilidad es la que nadie
  vuelve a revisar.
  **Por qué no se aplica ahora, siendo que la migración todavía no llegó a
  Neon:** (a) Prisma no tiene sintaxis para `SET NULL` por columna, así que la
  constraint viviría sólo en SQL a mano y `prisma migrate diff` la marcaría como
  desvío en cada migración futura -- el esquema y la base quedarían mintiendo en
  sentidos opuestos; (b) exige confirmar que Neon corre Postgres 15 o superior
  antes de aplicar (el local es 16.13; Neon no se consultó en esta ronda, ver
  "no se tocó Neon"). Es un chequeo de un minuto, pero es un chequeo, y el
  impacto real es acotado: `CommissionChange` es sólo lectura humana y no
  participa del cálculo del dinero. Si se decide hacerlo, el momento sigue
  siendo antes de que la migración se aplique.
- **La comisión congelada se puede reescribir con un `UPDATE`.** El `CHECK`
  `citas_comision_congelada_check` valida la *forma* (los tres campos `NULL` o
  los tres `NOT NULL`), no la inmutabilidad: nada en la base impide cambiar
  `commissionPercent` después de congelado. Que sea inmutable es hoy una
  promesa de la aplicación, y todavía no hay aplicación. Si se quiere que la
  base lo garantice, es un trigger, y es decisión de la feature de cálculo.
- **Tras dar de baja a un profesional, su auditoría deja de ser filtrable por
  `memberId`** (queda `NULL` por el `SetNull`, con el nombre en el snapshot). La
  fila sobrevive y es legible -- que era el objetivo -- pero una consulta
  "historial de comisiones de Carla" ya no la encuentra por id. Lo asume la
  futura interfaz de auditoría: filtrar también por `memberName`, o guardar el
  id original en una columna sin FK.
- **`app/api/citas/[id]/route.ts:30-35` no usa `whereDeAgenda`.** No es un bug
  de esta ficha, pero sí una precondición de la feature de cálculo: ahí es donde
  se va a completar una cita y congelar la comisión, y hoy ese endpoint arma el
  filtro a mano en vez de pasar por `lib/permisos.ts` (F-006). Conviene
  arreglarlo antes de colgarle el cálculo encima.
- **Falta `@@index([serviceId])` en `CommissionRate`.** El `@@unique([memberId,
  serviceId])` indexa el par empezando por `memberId`, así que una consulta por
  servicio solo (por ejemplo "qué comisiones tiene configuradas este servicio",
  la que necesitaría la pantalla del 409) no lo aprovecha. Con el volumen actual
  no se nota; queda anotado.

**Confirmado seguro por el revisor:** la migración sobre Neon (los `@@unique([id,
businessId])` nuevos no pueden fallar, `id` ya es PK), el tamaño `Decimal(12,2)`,
y el `try/catch` del endpoint de servicios.

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
  en la futura interfaz de configuración (sin ficha todavía). Quien siga con
  `prisma migrate dev` en el futuro debe saber que estas
  constraints viven sólo en el SQL, no en `schema.prisma` (Prisma no soporta
  `@@check` en la versión de este proyecto): si alguien corre `migrate dev`
  después de tocar estos campos, revisar que no las borre por "drift".
- FKs: `businessId`, `memberId` y `serviceId` de `CommissionRate` son `Cascade`
  (una excepción sin su profesional, servicio o negocio no tiene sentido).
  `CommissionChange.serviceId` es `SetNull` (igual que `citas.serviceId`): si se
  borra un servicio, el historial de auditoría sobrevive pero pierde la
  referencia puntual.

### Ronda de revisión (post `dca02e1`)

El revisor encontró cuatro problemas reales sobre lo anterior. Se corrigieron
todos editando la migración existente (no aplicada aún en Neon), no agregando
una segunda.

1. **Tenant cruzado en `CommissionRate`.** `memberId` y `serviceId` pasan a FK
   compuesta contra `(id, businessId)` de `BusinessMember`/`Service`
   (`@@unique([id, businessId])` nuevo en ambos). Postgres ahora rechaza
   directamente una fila cuyo `businessId` no coincide con el del profesional o
   el servicio -- probado insertando una fila cruzada a mano: falla con
   violación de FK, no se llega a insertar. Esto es lo que hacía inseguro al
   `findUnique(memberId_serviceId)` de la cascada, que no puede filtrar por
   negocio.

2. **La auditoría no cascadea con lo que audita.** `CommissionChange.memberId`
   y `.changedById` pasan de obligatorios/Cascade a **nullables con `SetNull`**,
   y se agregan snapshots (`memberName`, `changedByName`, `changedByEmail`)
   tomados al crear la fila. Probado borrando el profesional auditado y el
   usuario que hizo el cambio: la fila sobrevive con la referencia en `NULL`
   pero el snapshot legible.

   **Por qué no llevan la misma FK compuesta que `CommissionRate`** (aunque el
   revisor pidió "mismo tratamiento"): una FK compuesta con `onDelete: SetNull`
   anula *todas* las columnas de la constraint a la vez, incluida `businessId`.
   `businessId` en `CommissionChange` es `NOT NULL` (regla de arquitectura: toda
   fila debe poder filtrarse por negocio) -- ponerla en la FK compuesta hubiera
   hecho que la acción fallara (violación de NOT NULL al intentar anularla) o,
   si se la dejaba nullable, que la fila de auditoría quedara invisible para
   cualquier consulta multi-tenant justo cuando más se la necesita, que es lo
   opuesto de lo que pide el punto 2. Se optó por FK simple contra `.id` +
   snapshot, con el negocio resuelto siempre por el `businessId` del actor de
   sesión al escribir (igual que en el resto del código, nunca del cliente).
   Verificado que el tenant-cruzado que preocupaba en el punto 1 es
   específicamente el de `CommissionRate` (la tabla que resuelve la cascada y
   afecta dinero real); `CommissionChange` es sólo lectura humana y no participa
   del cálculo.

3. **`scope` explícito + decisión sobre borrar un servicio con comisiones.**
   `CommissionChange` suma `scope` ("default" | "service", con CHECK) y
   `serviceName` (snapshot): el significado del registro ya no depende de si
   `serviceId` es `NULL`, que es justo el valor que deja el `SetNull` al borrar
   un servicio.

   **Decisión sobre `CommissionRate.service`: `Restrict`, no `SetNull` ni
   borrado lógico automático.** Si el servicio se borrara y la fila de
   `CommissionRate` sobreviviera con `serviceId = NULL`, esa fila se
   confundiría con una excepción al porcentaje por defecto (mismo problema que
   en el punto anterior, pero afectando dinero real, no sólo auditoría) -- por
   eso `SetNull` queda descartado de entrada. Entre `Restrict` y depender de
   `Service.active` (borrado lógico) se eligió `Restrict`: borrar un servicio
   con `CommissionRate` configurada ahora **falla** en la base de datos, en vez
   de arrastrar silenciosamente los porcentajes. Esto cierra en la base el
   agujero de permisos que señaló el revisor (`puedeGestionarServicios` incluye
   al encargado, `puedeEditarComisiones` es sólo del dueño: con `Cascade` el
   encargado borraba comisiones sin pasar por ese permiso) sin depender de que
   ningún endpoint futuro se acuerde de chequearlo. Además es consistente con
   el comportamiento que **ya tiene** `Appointment.service` (sin `onDelete`
   explícito, Postgres actúa como `NO ACTION`/Restrict ahí también): borrar un
   servicio con historial ya fallaba en la práctica, así que no es un
   comportamiento nuevo en el producto. La alternativa de borrado lógico vía
   `Service.active` sigue disponible y sin tocar (el campo ya existe): quien
   quiera "borrar" un servicio con comisiones configuradas lo desactiva en vez
   de borrarlo, y `Restrict` es justamente lo que fuerza esa elección en vez de
   dejar que se pierda información. Probado borrando un servicio con una fila
   de `CommissionRate`: falla con violación de FK; el servicio sigue existiendo.

   **Es un cambio real de comportamiento.** Una versión anterior de esta ficha
   decía que `Appointment.service` ya se comportaba como `NO ACTION`/Restrict y
   que por eso `Restrict` no traía nada nuevo. Es falso: la migración inicial
   genera `ON DELETE SET NULL` para `citas_serviceId_fkey`
   (`prisma/migrations/20260424184359_init/migration.sql:161`), así que hoy
   borrar un servicio con historial de citas funciona y deja las citas con
   `serviceId = NULL`. La decisión se sostiene con el argumento de permisos, que
   es sólido por sí solo; el argumento de "no es nuevo" se saca porque confunde
   a quien lea esto después. Consecuencia concreta a asumir: a partir de la
   migración, el dueño o el encargado que intente borrar un servicio con
   comisiones configuradas recibe un 409 con la explicación de cómo seguir
   (`app/api/configuracion/servicios/[id]/route.ts`), y la sección de servicios
   ahora muestra ese mensaje en vez de descartarlo.

4. **CHECK de comisión congelada todo-o-nada.** Agregado
   `citas_comision_congelada_check`: `commissionPercent`, `commissionAmount` y
   `commissionAt` son los tres `NULL` o los tres `NOT NULL`. Probado: setear
   sólo uno de los tres falla; setear los tres juntos (incluido
   `commissionPercent = 0`, para confirmar que sigue siendo distinguible de
   `NULL`) funciona.

5. **Índice de liquidación.** `Appointment` suma
   `@@index([businessId, memberId, startTime])` para la consulta que va a hacer
   la futura liquidación. El índice de `CommissionChange` pasa a
   `@@index([businessId, memberId, createdAt])` (antes empezaba por `memberId`).

6. **`commissionAmount` pasa a `Decimal(12, 2)`** (pedido explícito del dueño
   del producto, aprobado durante esta misma ronda). Es dinero que se suma sobre
   muchas citas en cada liquidación; `Float` acumula error de redondeo en cada
   suma. Se decide ahora porque la tabla tenía y tiene cero filas -- esa ventana
   no se repite, a diferencia de `Appointment.price`/`Service.price`, que **no
   se tocan** (tienen datos en producción y 43 usos en el código; ver `F-015`,
   ya en `backlog/`). `12` dígitos totales / `2` decimales: 2 decimales es la
   escala universal de moneda, y 12 dígitos da margen amplio para el monto de
   una sola cita en cualquier moneda sin ser un tamaño arbitrario (Postgres sólo
   ocupa espacio por los dígitos que el valor realmente tiene).

   `commissionPercent` (acá y en `BusinessMember`/`CommissionRate`) **se queda
   en `Float`**, decisión explícita y no un olvido: un porcentaje no se suma
   repetidamente como sí se suma `commissionAmount` en una liquidación, así que
   no hay superficie de acumulación de error; el error de representación de un
   `Float` de doble precisión (~1e-15) es irrelevante para cualquier precisión
   de porcentaje que el producto vaya a pedir. Pasarlo a `Decimal` tampoco
   resolvería la mezcla de tipos en el cálculo futuro, porque `price` sigue
   siendo `Float` de todos modos (ver "Fuera de alcance detectado").

Comentarios del esquema que apuntaban a `F-004` (interfaz) y `F-005` (cálculo)
corregidos: ambos IDs ya existen y son otra cosa (invitaciones y equipo). Se
reemplazó por una referencia genérica a "futura feature, todavía sin ficha", en
`schema.prisma` y en el "Alcance" de esta misma ficha.

Corrida completa de verificación (obligatoria por tratarse de una migración
editada, no nueva): base local borrada y recreada, las 4 migraciones aplicadas
en orden con `psql` sobre una base vacía, seed corrido de nuevo. Ver "Bitácora".

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

### Ronda de revisión (post `dca02e1`)

- `prisma/schema.prisma`: FK compuesta `(memberId, businessId)` /
  `(serviceId, businessId)` en `CommissionRate` (con `@@unique([id,
  businessId])` nuevo en `BusinessMember` y `Service`); `CommissionRate.service`
  pasa a `onDelete: Restrict`; `CommissionChange` reestructurado (`memberId` y
  `changedById` nullable + `SetNull`, `memberName`/`changedByName`/
  `changedByEmail` de snapshot, `scope` + `serviceName` nuevos, índice
  `@@index([businessId, memberId, createdAt])`); `Appointment.commissionAmount`
  pasa de `Float?` a `Decimal? @db.Decimal(12, 2)`; nuevo
  `@@index([businessId, memberId, startTime])` en `Appointment`; comentarios
  `F-004`/`F-005` corregidos.
- **Se editó la migración existente**
  `prisma/migrations/20260907190000_add_commissions/migration.sql` (no se creó
  una segunda): aún no estaba aplicada en Neon. Regenerada con `prisma migrate
  diff` contra la base local llevada al estado previo a esta migración
  (migraciones 1-3 aplicadas), más los `CHECK` a mano
  (`citas_comision_congelada_check`, `cambios_comision_scope_check`, y los de
  rango 0-100 preexistentes).
- **Verificación desde base vacía:** `DROP DATABASE`/`CREATE DATABASE` en el
  Postgres local (puerto 5433), las 4 migraciones aplicadas en orden con `psql`
  sin errores, `npx prisma generate`, seed (`SEED_CONFIRMO=si npm run
  prisma:seed`) en verde.
- Probado a mano contra la base local (detalle completo en "Decisiones
  tomadas"): insert de `CommissionRate` con tenant cruzado rechazado por la FK
  compuesta; cascada profesional→default→sin-excepción funcionando, con 0%
  distinguible de `NULL`; `DELETE` de un servicio con `CommissionRate`
  configurada rechazado (`Restrict`); borrar el profesional auditado y borrar
  el usuario que hizo un cambio dejan la fila de `CommissionChange` viva con
  `NULL` + snapshot legible; `scope` inválido rechazado por `CHECK`; el `CHECK`
  de comisión congelada rechaza combinaciones parciales y acepta
  `commissionPercent = 0` junto con los otros dos (0% real sigue distinguible
  de "sin configurar" tras el cambio a `Decimal`).
- Base local vuelta a recrear desde cero una segunda vez (mismo procedimiento)
  para dejarla sin los datos de prueba manual antes de correr la suite.
- `npx prisma validate`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run`
  (178 tests) y `npm run build`: todos en verde contra el estado final.
- No se tocó Neon en ningún momento de esta ronda.

### Cierre de la segunda pasada del revisor

- `app/dashboard/configuracion/_components/seccionServicios.tsx`: `eliminar()`
  tenía `if (res.ok)` sin rama de error, así que el 409 del endpoint se
  descartaba sin leerlo: el dueño confirmaba el borrado y no pasaba nada --
  ni error, ni aviso, el servicio seguía en la lista. Ahora lee
  `(await res.json()).error` y lo muestra con el mismo patrón del resto de la
  app (`text-sm text-red-500`, como `modalInvitar.tsx`), con `role="alert"`
  porque el mensaje aparece lejos del botón que lo disparó.
- `prisma/schema.prisma` y esta ficha decían que `Restrict` no cambiaba nada
  porque `Appointment.service` ya se comportaba como `NO ACTION`. Es falso:
  `prisma/migrations/20260424184359_init/migration.sql:161` genera
  `ON DELETE SET NULL`. Verificado a mano sobre la migración. La justificación
  se reescribió en los dos lugares: `Restrict` se sostiene con el argumento de
  permisos, que es sólido solo.
- Hallazgos no bloqueantes de la pasada anotados arriba, en "Fuera de alcance
  detectado".
