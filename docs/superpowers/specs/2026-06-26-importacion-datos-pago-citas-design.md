# Importación de datos históricos + registro de pago por cita

## Contexto: por qué esto importa más allá de D'Chamas

Eli es una app de reservas multi-tenant cuyo objetivo es centralizar en un solo lugar lo que hoy las empresas de bienestar manejan repartido entre varias herramientas (agenda externa, planilla de Excel, WhatsApp, Google Calendar, POS). D'Chamas (salón de belleza, 3 locales en Santiago de Chile) es el primer caso real que estamos usando para validar ese problema: hoy reconcilian manualmente Fresha (reservas) + Google Calendar (agenda) + WhatsApp (recordatorios) + una planilla Excel (la verdad operativa real: qué se vendió, cómo se pagó, quién trabajó). Lo que resolvamos aquí —cómo traer ese histórico a Eli y cómo registrar pagos/especialistas tal como en el Excel— se vuelve el patrón de referencia para cualquier negocio de reservas que migre a Eli desde una planilla.

## 1. Lo que encontramos en los datos reales (resumen)

- 10 hojas en el Google Sheet del salón; la planilla es una reconciliación contable manual sobre Fresha + Calendar + WhatsApp, no la fuente única de reservas.
- 3 locales (Irarrázaval 1970, Local 45A, Local 10B), cada uno con personal propio.
- ~13 nombres de personal entre los 3 locales, alta rotación, sin emails de trabajo registrados.
- 10 categorías reales de método de pago (EFECTIVO, DEBITO, CREDITO, TRANSFERENCIA, CORTESÍA, GARANTÍA, GIFTCARD, REEMBOLSO, TARJETA DE FIDELIZACIÓN, INTERCAMBIO DE SERVICIO) + "Pago Dividido".
- Método de pago y propina se registran por fila/servicio individual, no solo por turno.
- Caja chica itemizada y lista negra de clientes (NO AGENDAR) existen en la planilla pero quedan fuera de esta primera versión.

Mapeo completo hoja por hoja en `ANALISIS-DATOS-SALON.md` (no se repite aquí).

## 2. Decisiones de arquitectura ya confirmadas (antes de esta sesión)

- Cada local es un `Business` separado en Eli — 3 tenants: Irarrázaval, 45A, 10B.
- Alejandro es el owner/login principal de los 3 por ahora.
- Personal: cuenta real (`User`) por trabajadora, no cuentas genéricas — pero sin crear placeholders por adelantado (ver política de mapeo en la sección 3).
- Eli reemplaza a Fresha hacia adelante como sistema operativo del negocio.
- **Restricción no negociable**: el modelo es por suscripción. `businessId` vive en el JWT, nunca en parámetros de URL (regla NEVER-change de `CLAUDE.md`). Sesiones, datos y usuarios nunca se mezclan entre negocios.

## 3. Nuevas decisiones (esta sesión)

- **Alcance v1 del import**: catálogo de precios/servicios + registro de citas con especialista y pago, ambos desde el día uno (no se escalona).
- **Es migración histórica de una sola vez**, no sincronización recurrente. No se construye lógica de deduplicación entre subidas futuras — después de este import, las citas y pagos se registran directo en Eli.
- **Especialista sin cuenta en una fila** → la fila se rechaza y se pide mapearla manualmente a un miembro existente del equipo. Nunca se crean cuentas automáticas con email placeholder.
- **Pago y propina por cita individual** (no solo por turno): se agregan `paymentMethod`, `paymentBreakdown` (solo si es pago dividido) y `tipAmount` a `Appointment`, reusando el mismo patrón Json que ya usa `ShiftClose.paymentBreakdown` — sin modelo nuevo, sin tocar el enum `PaymentMethod` existente.
- **Nada se guarda hasta confirmar**: el archivo se parsea, se muestra una vista previa (filas OK / con error / especialista sin mapear), se resuelve en pantalla, y al confirmar todo se guarda junto en una transacción.
- **El modal de crear/editar cita se actualiza en este mismo proyecto** para registrar método de pago y propina a mano, no solo vía import.

## 4. Qué se va a implementar

### 4.1 Esquema (Prisma)

- `Appointment`: + `paymentMethod String?`, `paymentBreakdown Json?`, `tipAmount Float?`.
- Sin cambios en `Service`, `Patient`, `BusinessMember`, ni en el enum `PaymentMethod`.

### 4.2 Nueva sección "Importar datos" (solo owner)

- Entrada en el sidebar (junto a Equipo/Configuración), ruta `/dashboard/importar`.
- Drop zone: acepta `.xlsx`, `.xls`, `.csv`. Selector de tipo de archivo — "Catálogo de precios" o "Registro de citas y pagos" — son dos parsers distintos, no un mapeo mágico universal.
- `POST /api/import/preview`: parsea el archivo en el servidor (librería `xlsx` + parser CSV), valida filas, intenta matchear especialista por nombre contra los `BusinessMember` del negocio activo, devuelve filas listas / con error de formato / con especialista sin match. Nada se persiste en este paso.
- Pantalla de revisión: tabla de filas problemáticas, con dropdown para mapear cada nombre sin match a un miembro real del equipo (o "omitir esta fila").
- `POST /api/import/commit` con el preview ya resuelto → crea `Service`/`Appointment`/`Patient` dentro de un `prisma.$transaction()`, scoped al `businessId` de la sesión activa.
- Resultado: resumen de filas importadas vs. omitidas y por qué.

### 4.3 Modal de citas (actualización)

- Campo de método de pago (select con las categorías reales) y propina en el modal existente de crear/editar cita.
- Si el método es "Pago dividido", se habilita un segundo método + monto.

### 4.4 Aislamiento multi-tenant (obligatorio)

- Todo el flujo usa el `businessId` de la sesión (JWT), igual que el resto de la app — nunca un `businessId` recibido del cliente.
- Cada uno de los 3 negocios importa su archivo por separado, en su propia sesión activa — nunca se procesan dos negocios en la misma operación.
- El matching de especialista solo busca contra `BusinessMember` del `businessId` activo — nunca cruza negocios.

### 4.5 Manejo de errores

- Archivo con formato irreconocible → error claro antes de mostrar la vista previa.
- Fila con datos incompletos (fecha inválida, precio no numérico) → se marca con error en el preview, no bloquea el resto del archivo.
- Si el commit falla a mitad de transacción → rollback completo (`prisma.$transaction` es todo-o-nada), no quedan imports parciales.

### 4.6 Testing

- Unit tests de los parsers (xlsx/csv → filas normalizadas) con muestras reales anonimizadas de PRECIOS y REGISTRO.
- Test de matching de especialista (match exacto, sin match → rechazo).
- Test de que el commit respeta `businessId` y no puede escribir en otro negocio.
- Test de pago dividido: `paymentBreakdown` suma correctamente al total de la cita.

## 5. Fuera de alcance v1

CLIENTES, CAJA CHICA, BITACORA DE EVENTOS, TOTALES, EMPLEADAS, NO AGENDAR, DATOS — quedan documentados en `ANALISIS-DATOS-SALON.md` como trabajo futuro, no se tocan en este proyecto.

## 6. Próximo paso

Con este documento aprobado, se pasa a un plan de implementación detallado (tareas, orden, archivos a tocar).
