# Eli

Sistema de reservas para **salones de belleza, barberías, salones de uñas y
clínicas dentales**. Cada negocio tiene su agenda, su equipo y su página
pública de reserva; los profesionales cobran un porcentaje del servicio que
atienden. La clínica dental suma lo clínico: ficha del paciente, odontograma,
plan de tratamiento y sillones.

Qué es, para quién y qué falta decidir: `docs/PRODUCTO.md`.

## Levantarlo

```bash
npm ci                 # instala exactamente lo que fija package-lock.json
npx prisma generate    # genera el cliente de la base
npm run dev
```

Necesita un `.env` con:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Postgres (Neon), conexión con pool. |
| `DIRECT_URL` | Postgres directo. Sólo lo usan las migraciones. |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | Sesiones. `NEXTAUTH_URL` arma los enlaces de los correos (en producción es obligatoria: sin ella esos correos no salen, en vez de salir con enlaces a localhost; `lib/url-base.ts`); de `NEXTAUTH_SECRET` se deriva la firma del enlace de baja de los correos de prueba. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Entrar con Google. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Correos. Sin esto no se envían, pero nada se rompe. |
| `SOPORTE_EMAIL` | Casilla que recibe las solicitudes de soporte (`/soporte` y `/dashboard/ayuda`). Sin esto la solicitud se guarda igual y el usuario recibe su acuse, pero no llega aviso a soporte. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting. En desarrollo, sin esto queda desactivado. **En producción es obligatorio:** sin él el límite falla cerrado y todo endpoint responde 429. |
| `CRON_SECRET` | Protege los crons (recordatorios y correos del ciclo de prueba). |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Fotos (logo, portada y foto de cada integrante): Cloudflare R2, accedido sólo desde el servidor. Son las cuatro juntas: el ID de la cuenta, la llave y el secreto de un token S3 con permiso sobre ese bucket, y el nombre del bucket (privado). **Sin ellas, en producción las fotos no están disponibles:** subir una responde 503, las páginas muestran las iniciales y nada más se rompe. En desarrollo, sin ellas las fotos se guardan en una carpeta temporal del sistema (`eli-fotos`). |

## Comandos

```bash
npm run dev            # desarrollo
npm run build          # build de producción
npm run lint           # eslint
npm test               # vitest
npx tsc --noEmit       # chequeo de tipos
npx prisma studio      # ver la base
```

Si movés o renombrás una ruta, corré `npx next typegen` antes de `tsc`: los
tipos de las rutas viven en `.next/types` y quedan viejos hasta el próximo build.

## Una base de desarrollo, para no tocar producción

`DATABASE_URL` apunta a Neon, que es **producción**: `migrate dev`, `db push` y
`migrate reset` van contra datos reales. Para trabajar tranquilo, levantá una
base local y apuntá el `.env` ahí.

Con Postgres instalado:

```bash
initdb -D ~/eli-pg -A trust -U postgres
pg_ctl -D ~/eli-pg -o '-p 5433' start
createdb -h localhost -p 5433 -U postgres eli
```

Aplicá las migraciones con `psql` en vez de con Prisma, para no arriesgarte a
que un comando salga apuntando a Neon:

```bash
for f in prisma/migrations/*/migration.sql; do
  psql -h localhost -p 5433 -U postgres -d eli -v ON_ERROR_STOP=1 -f "$f"
done
```

En el `.env`, `DATABASE_URL` y `DIRECT_URL` pasan a
`postgresql://postgres@localhost:5433/eli?schema=public`. Después:

```bash
SEED_CONFIRMO=si npm run prisma:seed
```

El seed se niega a correr si falta `SEED_CONFIRMO=si` **o** si el host de
`DATABASE_URL` no es `localhost` ni `127.0.0.1`. Para sembrar una base de
desarrollo remota, su host tiene que estar en `SEED_HOSTS_PERMITIDOS` (lista
separada por comas, p. ej. `SEED_HOSTS_PERMITIDOS=mi-base-de-desarrollo.example`).
Nunca pongas ahí el host de producción.

Quedan un negocio de ejemplo y tres cuentas —`duena@demo.eli`,
`encargado@demo.eli`, `profesional@demo.eli`, una por rol, que es la forma
corta de ver qué cambia con cada uno. La contraseña la imprime el seed al
terminar (está en `prisma/seed.ts`).


## Migraciones en producción

Las migraciones nuevas se aplican a mano con `psql` contra `DIRECT_URL` y
después se marcan como aplicadas para que Prisma no las vuelva a correr:

```bash
PGOPTIONS='-c lock_timeout=5s' psql "$DIRECT_URL" -v ON_ERROR_STOP=1 \
  -f prisma/migrations/<carpeta>/migration.sql
npx prisma migrate resolve --applied <carpeta>
```

Antes de aplicar, siempre:

1. **Un respaldo.** En Neon, crear un branch de la base de producción desde
   la consola (Branches → New branch, desde `main`, "Current point in time").
   Es una copia instantánea: si la migración deja algo mal después del
   COMMIT, se vuelve a ese punto restaurando el branch. Obligatorio en las que
   reescriben filas (hoy `20261109120000_etapa_7c_protesis_por_tipo` y, sólo
   por el relleno de `negocios.plan`, `20261112120000_etapa_9_planes_y_sedes`);
   igual de barato en todas. Se borra cuando el despliegue quedó andando.
2. **El orden.** Cada sección dice qué migración requiere antes; la consulta
   de "Qué migraciones están aplicadas" (más abajo) lo responde sin adivinar.

Los candados. Toda migración va en `BEGIN; … COMMIT;` y los candados que
toma (un `ALTER TABLE` toma uno exclusivo sobre su tabla) **duran hasta el
COMMIT**, no un instante: mientras tanto, las reservas, cobros o "Llegó" que
escriban en esas tablas esperan detrás. Si la migración misma tiene que
esperar un candado (un cobro largo en curso), todo lo que llegue después
queda en fila detrás de ella. `PGOPTIONS='-c lock_timeout=5s'` corta eso: si
un candado no llega en 5 segundos, la migración falla entera (no queda nada
a medias, va en una transacción) y se reintenta en otro momento. Las
migraciones desde `20261110120000_etapa_8_endurecer_protesis` (la 8 y la 9)
lo traen adentro (`SET LOCAL lock_timeout = '5s'`); las anteriores no, por eso
va en la línea de `psql`. Igual: fuera del horario de atención.

Las migraciones ya escritas no se editan (pueden estar aplicadas): lo que
haya que corregir va en una migración nueva.

### `20261022120000_ganchos_de_activacion`

Rompe la compatibilidad en los dos sentidos: el código viejo falla al crear
negocios con la migración aplicada (`pruebaTerminaEl` y `codigoInvitacion` son
NOT NULL sin default) y el código nuevo falla sin ella. Por eso:

1. Dejar el despliegue del código nuevo construido y listo para promover.
2. En una ventana tranquila (sin registros en curso), aplicar la migración. Va
   envuelta en `BEGIN; … COMMIT;`: si falla, no queda nada a medias.
3. Inmediatamente después, promover el despliegue del código nuevo.
4. `npx prisma migrate resolve --applied 20261022120000_ganchos_de_activacion`.

### `20261026120000_solicitudes_de_soporte`

Aditiva: sólo crea la tabla `solicitudes_de_soporte`. El código viejo no la
usa, así que se puede aplicar antes de desplegar; el código nuevo la necesita
para `POST /api/soporte`. Orden: aplicar la migración, desplegar, y
`npx prisma migrate resolve --applied 20261026120000_solicitudes_de_soporte`.

### `20261027120000_etapa_1_antes_de_vender`

Aditiva: columnas nuevas nullable o con default en `negocios`,
`miembros_negocio`, `clientes`, `servicios` y `citas`, y las tablas nuevas
`member_services` y `time_blocks`. El código viejo no las usa, así que se
puede aplicar antes de desplegar. Orden: aplicar la migración, desplegar, y
`npx prisma migrate resolve --applied 20261027120000_etapa_1_antes_de_vender`.

### `20261028120000_etapa_2_la_plata_del_equipo`

Aditiva: columnas nuevas con default o nullable en `negocios` (período de
liquidación y "liquidar desde"), `atencion_servicios`
(tipo de línea, producto, comisión congelada por línea y liquidación) y
`cambios_comision` (producto); un único `(id, businessId)` en `atenciones`; las
tablas nuevas `productos`, `atencion_propinas`, `liquidaciones`,
`movimientos_de_liquidacion` y `cierres_de_caja`; CHECKs, un índice único
parcial y los triggers `atencion_servicios_comision_inmutable`,
`atencion_servicios_liquidada_no_se_borra` y `atencion_servicios_mismo_negocio`,
escritos a mano.
No reescribe filas: las existentes cumplen los CHECKs nuevos con sus defaults.
El código viejo no usa nada de esto, así que se aplica **antes** de desplegar.
La aplica el dueño, nunca un agente (la única base configurada es producción).
Orden: aplicar la migración, desplegar, y
`npx prisma migrate resolve --applied 20261028120000_etapa_2_la_plata_del_equipo`.

### `20261029120000_etapa_3_avisos_por_correo`

Aditiva: columnas nuevas con default o nullable en `negocios` (enlace de
reseñas e interruptores de los mensajes a clientes), `servicios`
(`frecuenciaDias`) y `clientes` (consentimiento promocional por correo y su
baja); un único `(id, businessId)` en `clientes`; las tablas nuevas
`lista_de_espera` y `envios_a_clientes`, y CHECKs escritos a mano. No reescribe
filas: las existentes cumplen los CHECKs nuevos con sus defaults. El código
viejo no usa nada de esto, así que se aplica **antes** de desplegar. La aplica
el dueño, nunca un agente (la única base configurada es producción). Orden:
aplicar la migración, desplegar, y
`npx prisma migrate resolve --applied 20261029120000_etapa_3_avisos_por_correo`.

### `20261030120000_etapa_4_reservas_seguras`

Aditiva: columnas nuevas con default o nullable en `negocios` (con cuántas
faltas una reserva pública entra por confirmar, y la fila virtual: encendida y
su tope), `citas` (`confirmacionPorFaltas`) y `atenciones` (origen `tablero` o
`fila` y los datos del turno de la fila virtual); dos índices únicos en
`atenciones` (`filaTokenHash`, y negocio + día + número de turno) y CHECKs
escritos a mano. No reescribe filas: las atenciones que existen quedan con
origen `tablero` y las columnas de la fila en null, que cumplen los CHECKs. El
código viejo no usa nada de esto, así que se aplica **antes** de desplegar; el
código nuevo la necesita para la fila virtual, el tablero y la reserva
pública. La aplica el dueño, nunca un agente. Orden: aplicar la migración,
desplegar, y
`npx prisma migrate resolve --applied 20261030120000_etapa_4_reservas_seguras`.

Bloqueos: los dos índices únicos se construyen dentro de la transacción (no
son `CONCURRENTLY`) y bloquean las escrituras en `atenciones` (el tablero)
hasta el COMMIT: fuera del horario de atención.

### `20261031120000_etapa_5_reservas_a_medida`

Aditiva: columnas nuevas con default en `negocios` (`horaValleActiva`) y
`servicios` (`excluidoDeHoraValle`); un único `(id, businessId)` en `citas`; las
tablas nuevas `cita_servicios` y `franjas_de_hora_valle`, CHECKs y el trigger
`cita_servicios_mismo_negocio`, escritos a mano. No reescribe filas: las citas
de antes quedan sin filas en `cita_servicios` y se siguen leyendo por
`serviceId`. El código viejo no usa nada de esto, así que se aplica **antes**
de desplegar. La aplica el dueño, nunca un agente (la única base configurada
es producción). Orden: aplicar la migración, desplegar, y
`npx prisma migrate resolve --applied 20261031120000_etapa_5_reservas_a_medida`.

Ojo con el bloqueo: `CREATE UNIQUE INDEX "citas_id_businessId_key"` corre
dentro de la transacción de la migración (no es `CONCURRENTLY`), así que
mientras se construye el índice bloquea las escrituras en `citas` (reservas
nuevas, reagendar, cancelar, "Llegó"). Con las tablas de hoy dura poco y es
aceptable, pero conviene aplicarla fuera del horario de atención.

### `20261105120000_cierre_de_la_v1`

Deudas de esquema de la v1: default `{}` en `clientes.tags` (y los NULL pasan a
`{}`, la única escritura sobre filas existentes), CHECKs de dominio con los
valores que la app ya usa, un índice en `citas("startTime")` para el cron de
recordatorios, y las tres funciones trigger de la etapa 2 con `search_path`
fijo. El código viejo y el nuevo funcionan con o sin ella: se aplica antes o
después de desplegar. La aplica el dueño, nunca un agente.

Las CHECKs van `NOT VALID`: crearlas no revisa las filas viejas, así que la
migración no falla por un dato antiguo. Pero Postgres sí revisa la fila entera
en cada UPDATE: una fila vieja con un valor fuera de la lista no se podría
editar después. **Antes de aplicarla**, estas consultas (sólo lectura) tienen
que volver con todos los conteos en 0; si alguna no, no aplicarla y avisar:

```sql
SELECT 'citas.status' AS columna, count(*) FROM "citas" WHERE "status" NOT IN ('pendiente', 'confirmada', 'en-progreso', 'completada', 'cancelada', 'no-asistio')
UNION ALL SELECT 'citas.canceladaPor', count(*) FROM "citas" WHERE "canceladaPor" IS NOT NULL AND "canceladaPor" NOT IN ('cliente', 'negocio')
UNION ALL SELECT 'clientes.whatsappConsentSource', count(*) FROM "clientes" WHERE "whatsappConsentSource" IS NOT NULL AND "whatsappConsentSource" NOT IN ('reserva-publica', 'panel', 'importacion')
UNION ALL SELECT 'negocios.cancelacionHorasAntes', count(*) FROM "negocios" WHERE "cancelacionHorasAntes" < 0 OR "cancelacionHorasAntes" > 72
UNION ALL SELECT 'negocios.type', count(*) FROM "negocios" WHERE "type" NOT IN ('salon', 'barberia', 'spa-de-unas', 'salud', 'fitness', 'otro')
UNION ALL SELECT 'miembros_negocio.role', count(*) FROM "miembros_negocio" WHERE "role" NOT IN ('admin', 'worker')
UNION ALL SELECT 'invitaciones.role', count(*) FROM "invitaciones" WHERE "role" NOT IN ('admin', 'worker')
UNION ALL SELECT 'atencion_pagos.method', count(*) FROM "atencion_pagos" WHERE "method" NOT IN ('efectivo', 'tarjeta-debito', 'tarjeta-credito', 'transferencia', 'billetera-digital')
UNION ALL SELECT 'horarios_laborales.dayOfWeek', count(*) FROM "horarios_laborales" WHERE "dayOfWeek" < 0 OR "dayOfWeek" > 6
UNION ALL SELECT 'servicios.duration', count(*) FROM "servicios" WHERE "duration" <= 0;
```

Orden: correr las consultas, aplicar la migración, y
`npx prisma migrate resolve --applied 20261105120000_cierre_de_la_v1`. El
índice nuevo bloquea las escrituras en `citas` mientras se construye (como en
la etapa 5): fuera del horario de atención. Con los conteos en 0 confirmados,
cada CHECK se puede validar cuando se quiera con
`ALTER TABLE "<tabla>" VALIDATE CONSTRAINT "<nombre>";` (opcional).

### `20261106120000_etapa_6_odontologia`

El rubro dental. Aditiva: columnas nuevas con default en `servicios`
(`esUrgencia`) y `citas` (`primeraVez`), una nullable en `citas` (`sillonId`,
con FK compuesta a `sillones`); las tablas nuevas `sillones`,
`fichas_clinicas`, `odontograma_marcas`, `evoluciones`,
`planes_de_tratamiento`, `etapas_del_plan` y `prestaciones_del_plan`, con
CHECKs, dos únicos parciales y los triggers `evoluciones_inmutables` y
`evoluciones_no_se_borran`, escritos a mano. Reemplaza `negocios_type_check`
por uno que suma `'odontologia'` (sigue `NOT VALID`). No reescribe filas. La
aplica el dueño, nunca un agente (la única base configurada es producción).

**Requiere `20261105120000_cierre_de_la_v1` aplicada antes**: borra y vuelve
a crear el CHECK del rubro que crea esa. Si no está, la migración falla entera
(va en una transacción) y no queda nada a medias.

**Se aplica antes de desplegar, sin excepción.** El cliente de Prisma nuevo
lee `servicios.esUrgencia`, `citas.primeraVez` y `citas.sillonId` en
cualquier consulta de servicios o citas: desplegado sin la migración, la
agenda, la reserva pública y el tablero fallan. Y el registro ya ofrece
"Clínica dental", que el CHECK viejo rechaza. Con la migración aplicada, el
código viejo sigue funcionando (no conoce las columnas ni las tablas nuevas).

Consulta previa (sólo lectura), si las de `cierre_de_la_v1` no se corrieron o
pasó tiempo desde entonces: tiene que volver 0. El CHECK nuevo acepta todo lo
que aceptaba el viejo, más `'odontologia'`.

```sql
SELECT count(*) FROM "negocios" WHERE "type" NOT IN ('salon', 'barberia', 'spa-de-unas', 'odontologia', 'salud', 'fitness', 'otro');
```

Orden: (la consulta, si hace falta), aplicar la migración, desplegar, y
`npx prisma migrate resolve --applied 20261106120000_etapa_6_odontologia`.
Bloqueos: los `ALTER TABLE` de `servicios`, `citas` y `negocios` toman un
bloqueo exclusivo hasta el COMMIT (los default son constantes: no reescriben
la tabla, así que la migración dura poco), y la FK nueva de `citas` revisa las citas existentes (todas con
`sillonId` en null) bloqueando sus escrituras mientras tanto. Con el tamaño de
hoy es poco; igual, fuera del horario de atención.

### `20261108120000_etapa_7_protesis`

Las prótesis de la clínica dental. Aditiva: las tablas nuevas
`laboratorios`, `materiales_de_protesis`, `excepciones_de_reparto_de_protesis`,
`cambios_de_reparto_de_protesis`, `protesis`, `eventos_de_protesis` y
`pagos_al_laboratorio`, con CHECKs, dos índices únicos sobre `lower("nombre")`
y los triggers `protesis_congelada`, `protesis_no_se_borra`,
`eventos_de_protesis_inmutables` y `atencion_servicios_reparto_de_protesis`,
escritos a mano; columnas nuevas nullable (sin default) en
`atencion_servicios` (`protesisId`, `odontologoCents`, `clinicaCents`,
`tecnicoCents`, `pagoAlLaboratorioId`, para el cobro por abonos de la etapa 7b) y
en `prestaciones_del_plan` (`protesisId`). No reescribe filas existentes ni
toca los triggers de la etapa 2. Lo único que escribe es un INSERT en la tabla
nueva: los cinco materiales iniciales a cada clínica dental que todavía no
tiene ninguno. La aplica el dueño, nunca un agente (la única base configurada
es producción).

**Requiere `20261106120000_etapa_6_odontologia` aplicada antes** (usa
`prestaciones_del_plan`). Si no está, falla entera (va en una transacción) y
no queda nada a medias. Usa `gen_random_uuid()`, que viene con Postgres 13 o
más nuevo.

**Se aplica antes de desplegar, sin excepción.** El cliente de Prisma nuevo
lee `atencion_servicios.protesisId` (y las otras columnas nuevas) en cualquier
consulta de líneas de atención, y `prestaciones_del_plan.protesisId` en el
plan: desplegado sin la migración, el tablero, la caja, la liquidación y el
plan fallan. Con la migración aplicada, el código viejo sigue funcionando (no
conoce las columnas ni las tablas nuevas).

Orden: aplicar la migración, desplegar, y
`npx prisma migrate resolve --applied 20261108120000_etapa_7_protesis`.

**Materiales de las clínicas que se registren entre aplicar y desplegar.** El
código viejo no los crea al registrar. Después de desplegar, correr de nuevo el
último bloque de la migración (desde `INSERT INTO "materiales_de_protesis"`
hasta su `;`): sólo agrega a las clínicas dentales sin ningún material (los
materiales no se borran, se desactivan), así que no duplica nada ni repone lo
que una clínica cambió. Para saber antes si hace falta (sólo lectura; tiene que
volver 0):

```sql
SELECT count(*) FROM "negocios" n WHERE n."type" = 'odontologia'
  AND NOT EXISTS (SELECT 1 FROM "materiales_de_protesis" m WHERE m."businessId" = n."id");
```

Bloqueos: los `ALTER TABLE` de `atencion_servicios` y `prestaciones_del_plan`
toman un bloqueo exclusivo hasta el COMMIT (columnas nullable sin default: no
reescriben la tabla, así que la migración dura poco); sus tres índices nuevos y sus dos FK revisan las filas
que hay (todas en null) bloqueando sus escrituras mientras tanto. Con el
tamaño de hoy es poco; igual, fuera del horario de atención.

Ojo: los dos índices únicos de nombre usan `lower()`, que distingue
mayúsculas de las letras con tilde (Ó/ó) sólo si la base tiene un `LC_CTYPE`
con UTF-8. En una base con `LC_CTYPE` `C` (como la local de desarrollo),
"Ó" y "ó" no chocan, igual que en la búsqueda sin mayúsculas de los sillones.

### `20261108130000_etapa_7b_abonos_de_protesis`

El cobro de las prótesis por abonos. Aditiva: la columna
`liquidaciones."comisionProtesisCents"` (`INTEGER NOT NULL DEFAULT 0`, la parte
de la odontóloga de los abonos que incluye cada liquidación) con su CHECK de
rango; reemplaza `liquidaciones_bruto_check` por uno que la suma al bruto; el
CHECK nuevo `atencion_servicios_abono_liquidado_check` (un abono sólo entra a
una liquidación con su reparto congelado y si la tratante no es la dueña), y
reemplaza (`CREATE OR REPLACE`) la función del trigger
`atencion_servicios_reparto_de_protesis` con una regla más: una línea sólo se
marca pagada al laboratorio si la prótesis está entregada y el pago es al
laboratorio de esa prótesis. No reescribe filas: las liquidaciones que ya
existen quedan con 0 y siguen cumpliendo el CHECK del bruto, y ninguna línea
existente tiene `protesisId`. La aplica el dueño, nunca un agente (la única
base configurada es producción).

**Requiere `20261108120000_etapa_7_protesis` aplicada antes** (reemplaza la
función de su trigger). Si no está, falla entera (va en una transacción) y no
queda nada a medias.

**Nunca después de la 7d.** La 7b reemplaza la función del trigger
`atencion_servicios_reparto_de_protesis` con su versión, sin las reglas que
le suma la 7d: aplicada después, las borra en silencio (no falla). Antes de
aplicarla, la consulta de "Qué migraciones están aplicadas" (abajo) tiene que
decir `7d = f`. Si ya pasó, `20261110120000_etapa_8_endurecer_protesis`
vuelve a poner la función completa.

**Se aplica antes de desplegar.** El cliente de Prisma nuevo lee
`liquidaciones.comisionProtesisCents`: desplegado sin la migración, las
liquidaciones (vista previa, cierre y comprobante) fallan. Con la migración
aplicada, el código viejo sigue funcionando: no conoce la columna (el default
0 cumple el CHECK del bruto al cerrar una liquidación), no crea abonos y no
paga al laboratorio.

Orden: aplicar la migración, desplegar, y
`npx prisma migrate resolve --applied 20261108130000_etapa_7b_abonos_de_protesis`.

Bloqueos: el `ADD COLUMN` de `liquidaciones` toma un bloqueo exclusivo hasta
el COMMIT (default constante: no reescribe la tabla, así que la migración dura
poco); los CHECK nuevos revisan
las filas que hay de `liquidaciones` y de `atencion_servicios` bloqueando sus
escrituras mientras tanto (cobros y cierres de liquidación). Con el tamaño de
hoy es poco; igual, fuera del horario de atención.

### `20261109120000_etapa_7c_protesis_por_tipo`

Correcciones del dueño a las prótesis (2026-11-09): sin cordales (18, 28, 38 y
48 no son piezas protésicas ni pilares; la total marca la arcada sin ellos),
etapas por tipo (removible y total: `impresion` → `rodete` → `enfilado` →
`entregada`; fija, corona e implante: `impresion` → `prueba` → `entregada`; sin
el paso "en laboratorio") y el tono VITA (`protesis.tono`, nullable, sin
default). Reemplaza `protesis_estado_check` (que ahora ata el paso al tipo),
`protesis_total_check` y `eventos_de_protesis_estado_check`, agrega
`protesis_sin_cordales_check` y `protesis_tono_check`, y reemplaza la función y
el trigger `protesis_congelada` (pasos por tipo; el tono se cambia hasta
entregar). La aplica el dueño, nunca un agente (la única base configurada es
producción).

**Requiere `20261108120000_etapa_7_protesis` y
`20261108130000_etapa_7b_abonos_de_protesis` aplicadas antes.** Si falta la
etapa 7, falla entera (va en una transacción) y no queda nada a medias; si
falta la 7b, **no falla**: se aplica igual, y la 7b aplicada después borraría
las reglas de la 7d (ver la 7b). Por eso, antes de aplicarla, la consulta de
"Qué migraciones están aplicadas" (abajo) tiene que decir `7b = t`.

**Reescribe filas** (lo dice su cabecera): convierte el estado de las prótesis
y de sus eventos (`en-laboratorio` → `impresion`; `prueba` y `ajustes` →
`enfilado` en removible y total, `prueba` en las demás; para los eventos
desactiva su trigger de inmutabilidad sólo durante ese UPDATE, dentro de la
transacción) y les saca los cordales a las totales (su valor es por arcada: no
cambia). Una prótesis entregada o anulada con un cordal queda como está.
**Si hay una prótesis en curso que no es total y tiene un cordal, la migración
no se aplica** y dice cuáles: anularla (o entregarla) desde la ficha con el
código de hoy, y aplicar de nuevo. Para saberlo antes (sólo lectura; tiene que
volver 0):

```sql
SELECT count(*) FROM "protesis" WHERE "tipo" <> 'total' AND "estado" NOT IN ('entregada', 'anulada')
  AND ("piezas" || "pilares") && ARRAY[18, 28, 38, 48]::INTEGER[];
```

**Rompe la compatibilidad en los dos sentidos, sólo en el seguimiento de las
prótesis:** con la migración aplicada, el código viejo falla al pasar a "En
laboratorio", "Prueba en boca" (en removible y total) o "Ajustes" (el CHECK
nuevo lo rechaza); el código nuevo lee `protesis.tono` y escribe los pasos
nuevos, así que sin la migración falla la pestaña Prótesis de la ficha (ver,
crear, avanzar y "Agregar al plan"); el cobro de abonos, la liquidación y el
pago al laboratorio no leen el tono y siguen andando. Por eso, como
`ganchos_de_activacion`: dejar el despliegue construido y listo, aplicar la
migración en una ventana tranquila (fuera del horario de atención) e
inmediatamente promover el despliegue. Después,
`npx prisma migrate resolve --applied 20261109120000_etapa_7c_protesis_por_tipo`.

Bloqueos: el `ALTER TABLE` de `protesis` y los de `eventos_de_protesis`
(desactivar y activar su trigger) toman un bloqueo exclusivo de esas dos
tablas hasta el COMMIT; los CHECK nuevos revisan todas sus filas. Son tablas
chicas: dura poco.

### `20261109130000_etapa_7d_protesis_entrega_con_laboratorio`

Arreglos de la revisión de las prótesis (2026-11-09). Aditiva, sin reescribir
filas: el CHECK nuevo `protesis_entrega_con_laboratorio_check` (una prótesis
entregada tiene laboratorio, salvo que su regla congelada no le dé nada al
técnico: `pbTecnico` = 0; sin laboratorio, la parte del técnico no aparecía en
"Por pagar al laboratorio" y ya no se podía asignar uno) y reemplaza
(`CREATE OR REPLACE`) la función del trigger
`atencion_servicios_reparto_de_protesis` con todo lo de las etapas 7 y 7b más
una segunda barrera para los abonos: al agregarlo, la prótesis es del mismo
paciente que la atención y la línea va a nombre de la tratante (`memberId` y
`byOwner` de la prótesis; pasar `memberId` a null sigue permitido, es
desvincular al miembro); al entrar a una liquidación, la prótesis está
entregada y la línea es de la tratante. La aplica el dueño, nunca un agente (la
única base configurada es producción).

**Requiere `20261108120000_etapa_7_protesis`,
`20261108130000_etapa_7b_abonos_de_protesis` y
`20261109120000_etapa_7c_protesis_por_tipo` aplicadas antes.** Va en una
transacción: si algo falla, no queda nada a medias. Si falta la 7b **no
falla**, y la 7b aplicada después le borraría las reglas: antes de aplicarla,
la consulta de "Qué migraciones están aplicadas" (abajo) tiene que decir
`7b = t` y `7c = t`.

**Si hay prótesis entregadas sin laboratorio y con parte del técnico, la
migración no se aplica** y dice cuáles. Para saberlo antes (sólo lectura; tiene
que volver 0):

```sql
SELECT "id", "businessId" FROM "protesis"
WHERE "estado" = 'entregada' AND "laboratorioId" IS NULL AND "pbTecnico" <> 0;
```

Si vuelve filas: una entregada no cambia desde la ficha, así que se arregla a
mano. Averiguar con la clínica qué laboratorio hizo cada una (sus ids en
`laboratorios`, del mismo `businessId`) y correr, por cada una:

```sql
BEGIN;
ALTER TABLE "protesis" DISABLE TRIGGER "protesis_congelada";
UPDATE "protesis" p
SET "laboratorioId" = l."id", "laboratorioNombre" = l."nombre", "updatedAt" = CURRENT_TIMESTAMP
FROM "laboratorios" l
WHERE p."id" = '<id de la prótesis>' AND p."estado" = 'entregada' AND p."laboratorioId" IS NULL
  AND l."id" = '<id del laboratorio>' AND l."businessId" = p."businessId";
-- Tiene que decir UPDATE 1; si no, ROLLBACK.
ALTER TABLE "protesis" ENABLE TRIGGER "protesis_congelada";
COMMIT;
```

Con el laboratorio puesto, su parte aparece en "Por pagar al laboratorio".
Después, aplicar la migración. Se descartó dejar el CHECK `NOT VALID`: Postgres
revisa la fila entera en cada UPDATE, y una entregada todavía se actualiza al
desvincular a su tratante (para borrar a ese miembro), que fallaría.

**Compatible en los dos sentidos.** El código nuevo anda sin ella (no lee nada
que ella cree: la exigencia del laboratorio y las reglas de los abonos las
hace también la aplicación), pero se aplica igual: es la segunda barrera. El
código viejo,
con la migración aplicada, sigue andando salvo al entregar sin laboratorio una
prótesis cuyo técnico lleva parte: falla (500) en vez de perder esa parte. Se
aplica en la misma ventana que el despliegue, antes o después. Luego,
`npx prisma migrate resolve --applied 20261109130000_etapa_7d_protesis_entrega_con_laboratorio`.

Bloqueos: el CHECK nuevo revisa todas las filas de `protesis` (tabla chica)
bloqueando sus escrituras mientras tanto; reemplazar la función no bloquea las
tablas.

### `20261110120000_etapa_8_endurecer_protesis`

Arreglos de la revisión pre-despliegue (2026-11-10). No crea tablas,
columnas ni CHECKs y no reescribe filas: reemplaza (`CREATE OR REPLACE`) dos
funciones de trigger.

- `eventos_de_protesis_inmutables`: un paso del seguimiento se borra sólo en
  la cascada de su prótesis, de su paciente o de su negocio, como
  `protesis_no_se_borra`. Antes, borrar un negocio entero podía fallar según
  el orden en que Postgres corre las cascadas (el de los oid de sus
  triggers internos, que cambia al restaurar un respaldo); reproducido
  contra Postgres.
- `atencion_servicios_reparto_de_protesis`: todo lo de las etapas 7, 7b y 7d,
  más una regla: un abono nuevo (o una línea que pasa a otra prótesis) no
  puede ir a una prótesis anulada. La aplicación ya lo impide (409); ésta es
  la segunda barrera. Los abonos que una prótesis ya tenía no se tocan.

**Requiere la 7, 7b, 7c y 7d aplicadas antes**: la migración lo revisa al
empezar y, si falta alguna, no aplica nada y dice cuál. Trae
`SET LOCAL lock_timeout = '5s'`. **Compatible en los dos sentidos** (el código
de hoy y el anterior ya cumplen las dos reglas): se aplica antes o después de
desplegar. Orden: aplicarla y
`npx prisma migrate resolve --applied 20261110120000_etapa_8_endurecer_protesis`.
Bloqueos: reemplazar una función no bloquea tablas.

### `20261112120000_etapa_9_planes_y_sedes`

Los dos planes: **Independiente** (sólo atiende la dueña; hasta 5 sedes, cada
una con su horario por día; no puede invitar) y **Equipo** (puede invitar; una
sola sede, que es la dirección del negocio y no tiene fila). Aditiva, con una
sola excepción: el relleno de `negocios.plan`. No reescribe ninguna otra fila.

- `negocios.plan` (`'independiente'` | `'equipo'`, default `'equipo'`, CHECK).
- Tabla `sedes` (nombre, dirección, comuna, teléfono E.164, orden, activo;
  nombre único por negocio; CHECKs de texto).
- `sedeId` nullable, con índice y FK compuesta `(sedeId, businessId)`, en
  `horarios_laborales` y `lista_de_espera` (CASCADE) y en `citas` (NO ACTION:
  una sede con citas no se borra, se desactiva). Una franja con sede exige
  "HH:MM" válido e inicio < fin (`horarios_laborales_sede_horas_check`); las
  franjas sin sede no cambian.
- Cuatro triggers (check_violation, `SET search_path = public`, sin SECURITY
  DEFINER): `invitaciones_exigen_plan_equipo` (sólo un negocio Equipo crea
  invitaciones), `negocios_cambio_de_plan` (a Independiente sólo sin
  integrantes ni invitaciones pendientes; a Equipo sólo sin sedes activas),
  `sedes_reglas` (una sede que queda activa exige plan Independiente y no más
  de 5 activas; al reactivar una, se revalidan sus horarios) y
  `horarios_sedes_sin_pisarse` (una franja activa con sede no se solapa, el
  mismo día, con la de otra sede activa; tocarse no es solaparse). Los cuatro
  toman el mismo candado por negocio,
  `pg_advisory_xact_lock(hashtext('plan-y-sedes:' || businessId))`, para que
  dos transacciones a la vez no pasen cada una una regla que se contradice con
  la de la otra; el código que lee y decide (crear una sede, cambiar de plan,
  invitar) puede tomarlo igual con `tx.$executeRaw`. Desactivar una sede con
  citas futuras activas lo bloquea la aplicación, no la base.

**El efecto visible del relleno.** Un negocio con algún integrante en
`miembros_negocio` o una invitación pendiente (sin aceptar, aunque esté
vencida) queda en `equipo`; **todos los demás** —los que hoy atienden solos—
pasan a `independiente` y **dejan de poder invitar** hasta que pasen a Equipo:
el trigger rechaza la invitación (con el código viejo, un 500). Para ver cómo
quedó y pasar a Equipo a quien corresponda (pasa siempre que no tenga sedes
activas):

```sql
SELECT plan, count(*) FROM negocios GROUP BY plan;
UPDATE negocios SET plan = 'equipo' WHERE slug = '<slug>';
```

**Antes de desplegar, no después.** El código viejo sigue andando con ella
aplicada (las columnas nuevas quedan en NULL, un negocio nuevo nace `equipo`
por el default y los triggers salen enseguida cuando no hay sede de por
medio; la única diferencia es lo de invitar, arriba). El código nuevo **no**
anda sin ella: lee y escribe `plan` y `sedeId`. Orden: respaldo (el relleno es
un UPDATE), aplicarla, desplegar, y
`npx prisma migrate resolve --applied 20261112120000_etapa_9_planes_y_sedes`.
No depende de la clínica dental, pero va después de la 8 en el historial.

Bloqueos y ventana: trae `SET LOCAL lock_timeout = '5s'`. Los `ALTER TABLE`
sobre `negocios`, `horarios_laborales`, `citas` y `lista_de_espera` toman un
candado exclusivo hasta el COMMIT (no reescriben: `ADD COLUMN` sin default o
con default constante, y las FK y los CHECK sólo recorren filas con `sedeId` en
NULL); los `CREATE INDEX` no son concurrentes y frenan las escrituras de su
tabla mientras se construyen. Antes del relleno bloquea las escrituras de
`miembros_negocio` e `invitaciones` (nadie invita ni acepta una invitación
mientras corre) para que el relleno y los triggers vean lo mismo. Con el
tamaño de hoy son segundos: fuera del horario de atención.

### Qué migraciones están aplicadas

Sólo lectura. Responde, por lo que cada migración deja en la base, cuáles de
las de la clínica dental y de la etapa 9 ya están (`t`) y cuáles no (`f`), sin
depender de `_prisma_migrations` (que se marca a mano y puede no coincidir):

```sql
SELECT
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'negocios_type_check')                AS "cierre_v1",
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sillones')            AS "6",
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'protesis')            AS "7",
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'liquidaciones' AND column_name = 'comisionProtesisCents')      AS "7b",
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protesis_tono_check')                AS "7c",
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protesis_entrega_con_laboratorio_check') AS "7d",
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'atencion_servicios_reparto_de_protesis'
          AND prosrc LIKE '%anulada y no recibe abonos%')                                    AS "8",
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sedes')               AS "planes_y_sedes",
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'atencion_servicios_reparto_de_protesis'
          AND prosrc LIKE '%otro paciente%')                                                 AS "reglas_7d_vigentes";
```

Cómo leerla: tienen que ser `t` desde la izquierda sin huecos (un `f` seguido
de un `t` es una migración salteada: avisar antes de seguir). `planes_y_sedes`
es la etapa 9 (`20261112120000_etapa_9_planes_y_sedes`): existe la tabla
`sedes`, que la migración crea junto con todo lo demás en una sola
transacción. Si `7d = t` y
`reglas_7d_vigentes = f`, la 7b se aplicó después de la 7d y le borró las
reglas: aplicar la etapa 8, que las vuelve a poner.

### Las migraciones de la clínica dental, en orden

Cada una requiere las anteriores. Las que falten se aplican en este orden,
con la consulta de arriba antes de cada una:

1. `20261106120000_etapa_6_odontologia` (requiere `20261105120000_cierre_de_la_v1`;
   su consulta previa, arriba). Antes de desplegar.
2. `20261108120000_etapa_7_protesis`. Antes de desplegar.
3. `20261108130000_etapa_7b_abonos_de_protesis`. Antes de desplegar, y
   nunca después de la 7d.
4. `20261109120000_etapa_7c_protesis_por_tipo` (respaldo y su consulta
   previa, arriba), **en la misma ventana que el despliegue**: aplicarla y
   desplegar enseguida.
5. `20261109130000_etapa_7d_protesis_entrega_con_laboratorio` (su consulta
   previa, arriba), en la misma ventana.
6. `20261110120000_etapa_8_endurecer_protesis`, en la misma ventana.
7. Desplegar.
8. `npx prisma migrate resolve --applied` de cada una, en el mismo orden.
9. Si alguna clínica se registró entre aplicar la etapa 7 y desplegar, correr
   la consulta de materiales de la etapa 7 (arriba) y, si no vuelve 0, su
   último bloque.

Qué necesita el código de hoy para andar: las cuatro primeras (6, 7, 7b y
7c). Sin alguna de ellas falla en la agenda, el tablero, el plan, las
liquidaciones o la pestaña Prótesis, según cuál falte: no desplegar así. La
7d y la 8 no las necesita para andar (son la segunda barrera de reglas que
la aplicación ya cumple), pero van en la misma ventana: no se dejan para
después. Si las tres primeras ya están aplicadas y el código desplegado es
el de la etapa 7b, faltan la 7c, la 7d y la 8.

### Teléfonos antiguos a `+56` (#92)

Los teléfonos de clientes guardados antes de la etapa 1 siguen como se
escribieron. `scripts/normalizar-telefonos.ts` los pasa al formato que usa la
app (`+56912345678`) con la misma regla que el panel (`aE164Chile`). Por
defecto sólo simula: cuenta cuántos cambiaría y cuántos no se pueden leer, sin
mostrar teléfonos ni nombres. Lo corre el dueño:

```bash
node scripts/normalizar-telefonos.ts                         # simula, todos los negocios
node scripts/normalizar-telefonos.ts --negocio <businessId>  # simula, un negocio
node scripts/normalizar-telefonos.ts --aplicar               # escribe
```

Escribe de a lotes y sólo si el teléfono sigue igual que cuando lo leyó (si
alguien lo editó mientras tanto, lo deja). Los que no se pueden leer como
chilenos no se tocan: se corrigen a mano desde la ficha.

## Cómo está organizado

```
app/                          Pantallas y endpoints (App Router de Next.js)
  (acceso)/                   Entrar, crear cuenta, completar perfil, recuperar
                              contraseña y unirse a un equipo. Los paréntesis
                              agrupan sin cambiar la URL.
  dashboard/                  El panel del negocio
    page.tsx                  Inicio del panel
    tablero/                  El día en columnas: llegadas, atención y cobro
    reportes/                 Historial de lo cobrado, con filtros
    agenda/  clientes/  configuracion/  equipo/
    chats/                    Escondido: redirige al inicio hasta que exista WhatsApp
  reservar/[slug]/            Página pública donde el cliente final reserva
  api/                        Endpoints: cada carpeta es una URL bajo /api
components/
  comunes/                    Componentes base del diseño: botones, campos, tarjetas, secciones, logo
  panel/                      Estructura del panel: barras, avatar, tarjeta de cita, modales
  landing/                    Secciones de la página de inicio
  movimiento/                 Tiempos de animación y patrones de movimiento de la landing
  proveedores.tsx             Sesión de NextAuth y MotionConfig (movimiento reducido) para toda la app
lib/                          Lógica compartida, cada archivo con su test al lado,
                              salvo cuatro: llegadas.ts y lineas-de-atencion.ts se
                              prueban a través de los tests de app/api/atenciones/,
                              y auth.ts y prisma.ts, que sólo conectan la sesión y
                              la base, los tests de ruta los reemplazan por mocks.
                              Los marcados (servidor) usan la base o la sesión:
                              nunca se importan desde un componente de cliente.
  permisos.ts                 Quién puede ver y hacer qué. Toda consulta pasa por acá
  atenciones.ts               Reglas del tablero: estados, pasos, cobro en centavos
  acciones-del-tablero.ts     Qué ofrece cada tarjeta del tablero según rol y estado
  medios-de-pago.ts           Los medios de pago que se aceptan
  reportes.ts                 Turnos por zona horaria y resumen de lo cobrado
  periodos.ts                 Rangos de fechas de los filtros de reportes
  dinero.ts                   Formato y lectura de montos
  fechas.ts                   Cálculos y formatos de fecha
  horario-dia.ts              La jornada de un profesional: citas y huecos del día,
                              y la conversión entre "HH:MM" y minutos
  nombres-de-roles.ts         Cómo se escribe cada rol (Encargado y, según el rubro,
                              Estilista, Barbero, Manicurista, Odontólogo; Profesional sin
                              rubro). Sólo la etiqueta: lo que puede hacer cada uno está
                              en permisos.ts
  rubros.ts                   Los cuatro rubros que atiende Eli
  vocabulario.ts              Las palabras de cada rubro, con singular, plural y género
                              (`vocabularioDe(rubro).palabras`): estilista, barbero,
                              paciente, sala de espera…
  concordancia.ts             El artículo y la concordancia a partir del género: "una
                              estilista", "al paciente", "nueva", "todas". Nunca se pega
                              un artículo a mano a una palabra del vocabulario
  ejemplos-por-rubro.ts       Ejemplos y placeholders de cada pantalla, por rubro
  palabras-de-la-reserva.ts   Las palabras que lee quien reserva (hora/cita, motivo…)
  catalogo-de-preguntas.ts    Las preguntas de la ayuda, escritas como función de las
                              palabras del rubro
  servicios-del-profesional.ts Qué servicios hace cada profesional en la página pública
  renovacion-de-sesion.ts     Cada cuánto el navegador renueva la cookie dentro del panel
                              (y el plazo de revalidación que comparte con auth.ts)
  ajustar-foto-en-cliente.ts  (navegador) Reglas para achicar una foto antes de subirla
  enviar-foto.ts              (navegador) Manda la foto al servidor sin lanzar errores
  servicios-de-ejemplo.ts     Los servicios con que nace un negocio, según su rubro
  modulos.ts                  Los cinco módulos del panel: nombre, frase, ruta y color
  correos-de-prueba.ts        Qué correo del ciclo de prueba le toca hoy a un negocio
  recordatorios.ts            Qué cita recibe el recordatorio "es mañana" (en la zona
                              del negocio) y con qué fecha y hora
  ocupacion.ts                Qué ocupa el horario de un profesional o del negocio: citas
                              activas y bloqueos. La base se le pasa (sirve en un `tx`)
  mover-cita.ts               Las advertencias de agendar en el panel: choque, bloqueo,
                              fuera de horario (cálculo puro)
  advertencias-de-agenda.ts   Lee y arma esas advertencias al crear o mover una cita
  agenda-publica.ts           La reserva pública por profesional: quién atiende, horas
                              libres y a quién se asigna (la base se le pasa)
  gestion-de-cita.ts          El enlace para cancelar o reagendar sin cuenta: token,
                              plazo y qué cita se puede gestionar
  baja-de-correos.ts          El token firmado del enlace "Dejar de recibir estos correos"
  cron.ts                     La autorización de los crons (CRON_SECRET)
  enviar-correo-de-prueba.ts  (servidor) Manda un correo del ciclo de prueba, con su
                              candado en CorreoDeCuenta para no repetirlo
  direccion-de-scroll.ts      Si el encabezado de la landing se muestra, se oculta o flota
  validaciones.ts             Esquemas zod compartidos: registro, reserva y contraseña.
                              El resto de los endpoints define el suyo en su route.ts
  peticiones.ts               Cómo la interfaz le pide cosas al servidor
  cuerpo-del-pedido.ts        Leer el JSON (o los bytes de una foto) de un pedido con tope, sin que
                              uno roto o gigante termine en 500
  slug.ts                     La dirección pública de cada negocio
  telefono.ts                 Teléfonos chilenos: a E.164 para guardar y con espacios
                              para mostrar
  csv.ts                      Leer y escribir CSV sin librerías: separador, BOM,
                              comillas y celdas a salvo de fórmulas
  importar-clientes.ts        Importar clientes de un CSV: qué columna es cada dato,
                              validar cada fila y descartar repetidos
  exportar.ts                 Las planillas que se descargan: clientes y atenciones
  clientes-eliminados.ts      Eliminar un cliente es anonimizarlo: qué se borra y cómo
                              se lo reconoce sin columna nueva (una etiqueta reservada)
  utils.ts                    `cn`, para combinar clases de Tailwind
  tablero.ts                  (servidor) Leer y tomar atenciones dentro de un endpoint
  lineas-de-atencion.ts       (servidor) Validar y guardar las líneas de una atención
  llegadas.ts                 (servidor) Registrar la llegada de una reserva
  auth.ts                     (servidor) Sesiones: credenciales y Google
  prisma.ts                   (servidor) Conexión a la base
  email.ts                    (servidor) Correos (Resend)
  rate-limit.ts               (servidor) Límite de peticiones (Upstash)
  procesar-foto.ts            (servidor) Valida por su contenido y reduce una foto a WebP sin
                              metadatos (sharp): logo, portada o integrante
  almacenamiento-de-fotos.ts  (servidor) Dónde viven las fotos: R2 (producción), disco
                              (sólo desarrollo) y las claves válidas. Sin R2_* no hay fotos
  cambiar-foto.ts             (servidor) Subir y quitar una foto: límite, validación y orden
                              de escritura que comparten los dos endpoints de fotos
  invitaciones-de-equipo.ts   (servidor) Vigencia, enlace nuevo y correo de una
                              invitación al equipo (invitar, reemplazar una vencida, reenviar)
pruebas/                      Ayudas compartidas de los tests: la base falsa en memoria
                              con sus datos de ejemplo, pedidos y respuestas simulados.
                              Fuera de app/: no es una ruta ni entra al build
prisma/                       Esquema, migraciones y datos de ejemplo (seed.ts)
scripts/                      Tareas de mantenimiento que corre el dueño a mano
                              (normalizar-telefonos.ts), con la lógica testeada
proxy.ts                      Puerta de entrada: sesión y límite de peticiones (con su test)
types/                        Tipos que extienden librerías (la sesión de NextAuth)
public/images/                El logo
docs/                         Producto (PRODUCTO.md) y sistema de diseño (diseno/)
prisma.config.ts              Dónde están el esquema y las migraciones, y el comando del seed
vercel.json                   Los crons diarios (el plan Hobby no permite más de uno al
                              día): recordatorios y correos del ciclo de prueba, ambos
                              a las 13:00 UTC (~10:00 en Chile)
.github/workflows/ci.yml      CI: lint, tipos, tests y build en cada PR a main
```

Cada vista del panel se arma igual:

```
<vista>/page.tsx              Sólo compone: estado, llamadas y componentes
<vista>/_datos.ts             Todo lo que la vista le pide al servidor. Devuelve
                              { ok } en vez de lanzar, y la pantalla no conoce URLs
<vista>/_componentes/         Las piezas que sólo usa esa vista
```

## Convenciones

- **Idioma.** El dominio se nombra en español: `cliente`, `cita`, `agenda`. El
  inglés queda sólo donde lo impone una herramienta:
  - los archivos especiales de Next (`page.tsx`, `layout.tsx`, `route.ts`,
    `proxy.ts`);
  - el esquema de Prisma, cuyos modelos y columnas ya existen en producción.
- **Archivos y carpetas** en kebab-case: `modal-nueva-cita.tsx`.
- **Componentes** en PascalCase y en español: `ModalNuevaCita`. La página de
  cada ruta se exporta como `Pagina<Nombre>`.
- **Dónde va cada cosa:**
  - lo que usa una sola vista vive en su `_componentes/`;
  - lo que usan varias, en `components/`;
  - la lógica sin pantalla, en `lib/`, con su test al lado.
- **Nombres que dicen qué contienen**, con palabras completas: `respuesta`, no
  `res`; `servicio`, no `s`.
- **Diseño:** tokens y componentes base en `docs/diseno/README.md`; se usan
  sus clases (`bg-crema`, `rounded-tarjeta`), no colores ni medidas sueltos.

## Decisiones técnicas que no se tocan sin pensarlo

- **El esquema de Prisma y sus migraciones ya están aplicados en producción
  (Neon).** Para renombrar un modelo o un campo se usa `@map`: así se pasó de
  `Patient` a `Customer` sin tocar la base. Cambiar una columna de verdad pide
  una migración sobre datos reales.
- **Dinero en centavos.** Las tablas del tablero (atenciones, sus líneas y sus
  pagos) guardan centavos enteros (`priceCents`, `amountCents`, `totalCents`),
  con topes que no desbordan un `Int`. Las tablas anteriores (`Service.price`,
  `Appointment.price`) siguen en `Float`. La API habla en unidades y toda suma o
  comparación de dinero se hace en centavos (`lib/atenciones.ts`): 0,1 + 0,2
  tiene que dar 0,3 cuando se cuadra una caja.
- **NextAuth sigue en v4.** Auth.js v5 existe, pero migrar rompe lo que funciona
  sin aportar valor.
- **`npm audit fix --force` no se corre.** `npm audit` muestra avisos (next-auth
  vía `@auth/core`, zod, prisma, vitest, eslint) y su "arreglo" cambia de versión
  mayor (zod 3 → 4, prisma 6 → 7, vitest, eslint-config-next) o baja next-auth:
  rompe el código y los tests. La revisión pre-despliegue (2026-11-10) no
  encontró uno explotable en cómo Eli los usa (por ejemplo, todo cuerpo de
  pedido llega con tope de tamaño, `lib/cuerpo-del-pedido.ts`, antes de zod).
  Actualizar una dependencia es una tarea propia, con aprobación (CLAUDE.md,
  regla 4).
- **Vercel Hobby prohíbe el uso comercial.** Antes de cobrar hay que pasar a Pro
  o mover el despliegue.
- **Resend:** falta verificar el dominio (SPF/DKIM) o los correos caen en spam.
- **Pagos online:** los precios están decididos (`docs/PRODUCTO.md`, sección 4,
  y `lib/precios.ts`), pero todavía no se cobra. Falta elegir la pasarela:
  Flow quedó descartado (su cargo automático es sólo para empresas) y Mercado
  Pago está en evaluación.
- **Content-Security-Policy con nonce.** `proxy.ts` arma la CSP en cada
  petición con un nonce nuevo (`lib/csp.ts`) y el layout raíz fuerza el render
  por petición (`connection()`): sin eso las páginas saldrían del build sin
  nonce y el navegador les bloquearía el JS. **Cualquier script, estilo, fuente,
  imagen o servicio de terceros nuevo (analítica, chat, mapas, pagos, CDN) hay
  que agregarlo a propósito en `lib/csp.ts`**, con un test; si no, el
  navegador lo bloquea en producción. No se vuelve a poner una CSP en
  `next.config.mjs`: dos CSP se aplican a la vez y la estática, sin nonce,
  rompería los scripts de Next.

## Cómo se trabaja acá

Lee `CLAUDE.md`: es el contrato de trabajo. En resumen:

- el alcance de cada tarea se acuerda antes de escribir código;
- los permisos se preguntan siempre a `lib/permisos.ts`, nunca comparando roles
  a mano.
