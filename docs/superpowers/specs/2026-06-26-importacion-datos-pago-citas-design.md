# Importación de datos históricos + registro de pago por cita

## Contexto: por qué esto importa más allá de D'Chamas

Eli es una app de reservas multi-tenant cuyo objetivo es centralizar en un solo lugar lo que hoy las empresas de bienestar manejan repartido entre varias herramientas (agenda externa, planilla de Excel, WhatsApp, Google Calendar, POS). D'Chamas (salón de belleza, 3 locales en Santiago de Chile) es el primer caso real que estamos usando para validar ese problema: hoy reconcilian manualmente Fresha (reservas) + Google Calendar (agenda) + WhatsApp (recordatorios) + una planilla Excel de 10 hojas (la verdad operativa real: qué se vendió, cómo se pagó, quién trabajó, caja chica, clientes vetados). Lo que resolvamos aquí —cómo traer ese histórico completo a Eli y cómo registrar pagos/especialistas tal como en el Excel— se vuelve el patrón de referencia para cualquier negocio de reservas que migre a Eli desde una planilla.

## 1. Lo que encontramos en los datos reales (resumen)

- 10 hojas en el Google Sheet del salón; la planilla es una reconciliación contable manual sobre Fresha + Calendar + WhatsApp, no la fuente única de reservas.
- 3 locales (Irarrázaval 1970, Local 45A, Local 10B), cada uno con personal propio.
- ~13 nombres de personal entre los 3 locales, alta rotación, sin emails de trabajo registrados.
- 10 categorías reales de método de pago (EFECTIVO, DEBITO, CREDITO, TRANSFERENCIA, CORTESÍA, GARANTÍA, GIFTCARD, REEMBOLSO, TARJETA DE FIDELIZACIÓN, INTERCAMBIO DE SERVICIO) + "Pago Dividido".
- Método de pago y propina se registran por fila/servicio individual, no solo por turno.
- Caja chica itemizada por denominación y gasto, lista negra de clientes (NO AGENDAR), y resúmenes mensuales (TOTALES, EMPLEADAS) que son el mismo dinero de REGISTRO visto agregado.

Mapeo completo hoja por hoja en `ANALISIS-DATOS-SALON.md` (no se repite aquí).

## 2. Decisiones de arquitectura ya confirmadas (antes de esta sesión)

- Cada local es un `Business` separado en Eli — 3 tenants: Irarrázaval, 45A, 10B.
- Alejandro es el owner/login principal de los 3 por ahora.
- Personal: cuenta real (`User`) por trabajadora, no cuentas genéricas — pero sin crear placeholders por adelantado (ver política de mapeo en la sección 3).
- Eli reemplaza a Fresha hacia adelante como sistema operativo del negocio.
- **Restricción no negociable**: el modelo es por suscripción. `businessId` vive en el JWT, nunca en parámetros de URL (regla NEVER-change de `CLAUDE.md`). Sesiones, datos y usuarios nunca se mezclan entre negocios.

## 3. Nuevas decisiones (esta sesión)

- **Alcance v1 del import: las 10 hojas, no solo 2.** Todas las categorías del Excel del salón son tipos de archivo soportables desde el drop zone — no se deja ninguna "para después" salvo el matiz de TOTALES/EMPLEADAS abajo.
- **Es migración histórica de una sola vez**, no sincronización recurrente. No se construye lógica de deduplicación entre subidas futuras — después de este import, las citas y pagos se registran directo en Eli.
- **Especialista sin cuenta en una fila** → la fila se rechaza y se pide mapearla manualmente a un miembro existente del equipo. Nunca se crean cuentas automáticas con email placeholder.
- **Pago y propina por cita individual** (no solo por turno): se agregan `paymentMethod`, `paymentBreakdown` (solo si es pago dividido) y `tipAmount` a `Appointment`, reusando el mismo patrón Json que ya usa `ShiftClose.paymentBreakdown` — sin modelo nuevo, sin tocar el enum `PaymentMethod` existente.
- **TOTALES, EMPLEADAS y la parte de producción de BITACORA DE EVENTOS son resúmenes del mismo dinero que ya trae REGISTRO, no datos nuevos.** Se suben igual desde el drop zone, pero solo para **verificación/cruce**: Eli compara el total importado vs. el total declarado en el archivo y avisa discrepancias por periodo/trabajadora. No crean citas ni ingresos nuevos — evita duplicar facturación.
- **Nada se guarda hasta confirmar**: el archivo se parsea, se muestra una vista previa (filas OK / con error / especialista sin mapear), se resuelve en pantalla, y al confirmar todo se guarda junto en una transacción.
- **El modal de crear/editar cita se actualiza en este mismo proyecto** para registrar método de pago y propina a mano, no solo vía import.
- **No se construye integración bancaria real con Haulmer.** La verificación de depósito Haulmer→Banco Estado (específica de Reg. Domingo) se importa como dato/flag tal cual viene en la planilla, no como conciliación automática vía API de un banco o procesador de pago.

## 4. Qué se va a implementar

### 4.1 Esquema (Prisma)

- `Appointment`: + `paymentMethod String?`, `paymentBreakdown Json?`, `tipAmount Float?`.
- `ShiftClose`: + `cashExpenses Json?` (gastos itemizados: `[{descripcion, monto}]`), `cashDenominations Json?` (conteo de efectivo por billete/moneda), `bankDepositVerified Boolean?` (flag de verificación Haulmer→Banco Estado, hoy aplica solo a turnos de domingo).
- `BusinessMember`: + `emergencyContactName String?`, `emergencyContactPhone String?`.
- `Patient`: sin cambios de esquema — `tags`/`notes` ya cubren lista negra y no-show.
- Sin cambios en `Service` ni en el enum `PaymentMethod`.

### 4.2 Nueva sección "Importar datos" (solo owner)

- Entrada en el sidebar (junto a Equipo/Configuración), ruta `/dashboard/importar`.
- Drop zone: acepta `.xlsx`, `.xls`, `.csv`. Selector de tipo de archivo con 9 opciones (una por categoría real, ver 4.3–4.9 + 4.2 base):
  1. Catálogo de precios y servicios
  2. Registro de citas, pagos y especialistas (incluye variante "registro de domingo" con verificación de depósito)
  3. Clientes / agenda
  4. Caja chica
  5. Bitácora de eventos (producción + no-asiste)
  6. Totales (verificación)
  7. Empleadas (verificación)
  8. Lista negra / no agendar
  9. Datos de personal (contactos de emergencia)
- `POST /api/import/preview`: parsea el archivo según el tipo elegido (librería `xlsx` + parser CSV), valida filas, intenta matchear especialista/cliente por nombre contra los registros existentes del negocio activo, devuelve filas listas / con error de formato / sin match. Nada se persiste en este paso.
- Pantalla de revisión: tabla de filas problemáticas, con dropdown para mapear cada nombre sin match a un miembro o cliente real (o "omitir esta fila").
- `POST /api/import/commit` con el preview ya resuelto → crea/actualiza los modelos correspondientes dentro de un `prisma.$transaction()`, scoped al `businessId` de la sesión activa.
- Resultado: resumen de filas importadas vs. omitidas y por qué.

### 4.3 Catálogo de precios → `Service`

Sin cambios respecto a la versión anterior del spec: crea/actualiza `Service` (name, price, duration).

### 4.4 Registro de citas, pagos y especialistas → `Appointment` + `Patient`

Sin cambios respecto a la versión anterior: especialista sin match se rechaza y se mapea a mano; pago/propina van en los campos nuevos de `Appointment`. La variante "domingo" además marca `ShiftClose.bankDepositVerified` para ese turno si el archivo trae la columna de verificación Haulmer.

### 4.5 Clientes / agenda → `Patient` + `Appointment`

- Enriquece `Patient` con teléfono/email cuando hay match por nombre+fecha contra una cita ya importada desde Registro.
- Si una fila no matchea ninguna cita ya importada (agenda sin contraparte en Registro), se crea una `Appointment` nueva sin `price`/`paymentMethod` — queda como antecedente de agenda, no de venta.
- No se reintenta resolver los ~20 errores de fórmula (`#REF!`/`#ERROR!`) de la planilla original: esas filas se marcan como error de formato y se omiten, igual que cualquier fila corrupta.

### 4.6 Caja chica → `ShiftClose`

- Crea/actualiza `ShiftClose` por fecha de turno con `cashOpening`, `cashClosing`, `cashWithdrawals`, `cashDeposits` (ya existentes) + `cashExpenses` y `cashDenominations` (nuevos, sección 4.1).

### 4.7 Bitácora de eventos → verificación + `Patient`

- La parte de producción por trabajadora (servicios + $) se trata igual que Totales/Empleadas: **solo verificación**, no crea citas nuevas (ver sección 3).
- La lista de "agenda y no asiste" matchea/crea `Patient` y agrega tag `no-asiste` + nota con la fecha.

### 4.8 Totales y Empleadas → verificación únicamente

- No crean ni modifican `Appointment`, `Patient` ni `Service`.
- El commit calcula el total ya importado para el período/trabajadora correspondiente (a partir de los `Appointment` ya creados desde Registro) y lo compara contra las cifras del archivo.
- El resultado es un reporte de discrepancias en pantalla (no se persiste como modelo nuevo): "Marzo, Aranza C.: declarado $X, importado $Y, diferencia $Z".

### 4.9 Lista negra / no agendar → `Patient`

- Matchea/crea `Patient` por teléfono o email, agrega tag `no-agendar` + `notes` con el motivo (mala reseña, reclamo SERNAC, no pago, etc.). Sin bloqueo automático de reservas en esta fase.

### 4.10 Datos de personal → `BusinessMember`

- Solo la porción de contactos de emergencia. Locales (ya son 3 `Business` separados) y categorías de pago (ya cubiertas por el campo `paymentMethod` libre) no requieren import — son configuración ya resuelta en decisiones previas.
- Matchea por nombre contra `BusinessMember` existentes del negocio activo, misma política de rechazo+mapeo manual que especialistas en Registro (sección 3). Llena `emergencyContactName`/`emergencyContactPhone`.

### 4.11 Modal de citas (actualización)

- Campo de método de pago (select con las categorías reales) y propina en el modal existente de crear/editar cita.
- Si el método es "Pago dividido", se habilita un segundo método + monto.

### 4.12 Aislamiento multi-tenant (obligatorio)

- Todo el flujo usa el `businessId` de la sesión (JWT), igual que el resto de la app — nunca un `businessId` recibido del cliente.
- Cada uno de los 3 negocios importa sus archivos por separado, en su propia sesión activa — nunca se procesan dos negocios en la misma operación.
- El matching de especialista/cliente solo busca contra los registros del `businessId` activo — nunca cruza negocios.

### 4.13 Manejo de errores

- Archivo con formato irreconocible → error claro antes de mostrar la vista previa.
- Fila con datos incompletos (fecha inválida, precio no numérico, fórmula rota tipo `#REF!`) → se marca con error en el preview, no bloquea el resto del archivo.
- Si el commit falla a mitad de transacción → rollback completo (`prisma.$transaction` es todo-o-nada), no quedan imports parciales.

### 4.14 Testing

- Unit tests de los 9 parsers (xlsx/csv → filas normalizadas) con muestras reales anonimizadas de cada hoja.
- Test de matching de especialista/cliente (match exacto, sin match → rechazo).
- Test de que el commit respeta `businessId` y no puede escribir en otro negocio.
- Test de pago dividido: `paymentBreakdown` suma correctamente al total de la cita.
- Test de verificación Totales/Empleadas: no debe crear ni modificar `Appointment`/`Patient`/`Service`, solo reportar discrepancias.

## 5. Fuera de alcance v1

- Bloqueo automático de reservas para clientes en lista negra (solo se etiquetan, sin lógica de bloqueo).
- Integración bancaria/API real con Haulmer o Banco Estado (el flag de verificación se importa tal cual, sin reconciliación automática contra un banco).
- Sincronización recurrente entre el Excel y Eli — es migración de una sola vez.

## 6. Próximo paso

Con este documento aprobado, se pasa a un plan de implementación detallado (tareas, orden, archivos a tocar).
