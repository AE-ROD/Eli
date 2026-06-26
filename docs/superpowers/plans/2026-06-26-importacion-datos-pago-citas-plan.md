# Plan de implementación: importación de datos + pago por cita

Implementa el spec en `docs/superpowers/specs/2026-06-26-importacion-datos-pago-citas-design.md`. Lectura de ese documento es prerequisito — acá solo está el cómo y el orden, no se repiten las decisiones.

Convención: cada fase es testeable de forma aislada antes de pasar a la siguiente. No se avanza a UI sin que el esquema y los parsers tengan tests pasando.

## Fase 0 — Dependencias

- Agregar `xlsx` (SheetJS) a `package.json`. Cubre `.xlsx`, `.xls` y `.csv` con una sola librería (`XLSX.read` acepta buffer o string) — no se necesita `papaparse` aparte.
- `npm install xlsx` se corre en el sandbox (no requiere DB, solo red).

## Fase 1 — Esquema (Prisma)

Archivo: `prisma/schema.prisma`

- `Appointment`: + `paymentMethod String?`, `paymentBreakdown Json?`, `tipAmount Float?`.
- `ShiftClose`: + `cashExpenses Json?`, `cashDenominations Json?`, `bankDepositVerified Boolean?`.
- `BusinessMember`: + `emergencyContactName String?`, `emergencyContactPhone String?`.
- Generar migración: `npx prisma migrate dev --name pago_por_cita_y_datos_import` — **esto requiere DB local (`localhost:5432`), así que Alejandro debe correrlo en su máquina**, no desde este sandbox. Yo dejo el `schema.prisma` listo; el comando de migración queda como instrucción para él (o lo corro yo si en algún momento hay acceso a la DB desde aquí).
- Correr `npx prisma generate` después de migrar.

**Test de salida de esta fase:** `npx tsc --noEmit` no rompe por los tipos nuevos en ningún archivo que ya use `Appointment`/`ShiftClose`/`BusinessMember`.

## Fase 2 — Utilidades compartidas de import

Carpeta nueva: `lib/import/`

- `lib/import/tipos.ts` — tipos compartidos: `FilaOk<T>`, `FilaError`, `FilaSinMatch`, `ResultadoParseo<T>`.
- `lib/import/parseArchivo.ts` — wrapper sobre `xlsx`: recibe `Buffer` + nombre de archivo, devuelve filas como objetos (usa la primera fila como headers). Un solo punto de entrada para los 9 parsers.
- `lib/import/normalizar.ts` — funciones puras: parseo de fechas chilenas (`dd-mm-yyyy`, también variantes con `/`), parseo de montos CLP (separador de miles `.`, sin decimales), normalización de nombres (trim, minúsculas, sin tildes) para matching.
- `lib/import/matchEspecialista.ts` — recibe nombre normalizado + `businessId`, busca contra `BusinessMember` (con su `User.name`) del negocio activo. Devuelve match exacto o `null`. **Nunca** consulta fuera del `businessId` recibido.
- `lib/import/matchPaciente.ts` — mismo patrón pero contra `Patient`, por nombre y/o teléfono/email, scoped a `businessId`.

**Tests de esta fase** (`lib/import/*.test.ts`, vitest):
- Fechas y montos: casos válidos + casos rotos (`#REF!`, vacío, texto donde va número) → deben devolver error, no lanzar excepción.
- `matchEspecialista`/`matchPaciente`: match exacto, sin match, y el caso clave de aislamiento — dos negocios con un miembro de mismo nombre, búsqueda en negocio A nunca devuelve el de negocio B.

## Fase 3 — Parsers por tipo de archivo

Carpeta: `lib/import/parsers/`. Un archivo por tipo, mismo contrato: `parseX(filas: unknown[][], businessId: string) => Promise<ResultadoParseo<T>>`.

1. `precios.ts` → filas listas para `Service` (nombre, precio, duración).
2. `registro.ts` → filas listas para `Appointment` (incluye `paymentMethod`, `paymentBreakdown` si es pago dividido, `tipAmount`). Especialista sin match → `sinMatch`, nunca autocreación. Variante domingo: si la columna de verificación Haulmer está presente, agrega `bankDepositVerified` al turno correspondiente.
3. `clientes.ts` → enriquece `Patient` y crea `Appointment` solo si no matchea una cita ya existente (match por nombre+fecha). Filas con fórmula rota → error de formato.
4. `cajaChica.ts` → filas listas para `ShiftClose` (`cashExpenses`, `cashDenominations`).
5. `bitacoraEventos.ts` → separa en dos sub-resultados: producción (va a verificación, no crea nada) + no-show (tag `no-asiste` en `Patient`).
6. `totales.ts` → no genera filas para persistir; genera `{ periodo, trabajadora?, montoDeclarado }[]` para que el commit los compare contra lo ya importado.
7. `empleadas.ts` → mismo patrón que `totales.ts`, por trabajadora.
8. `listaNegra.ts` → filas listas para `Patient` con tag `no-agendar` + `notes`.
9. `datosPersonal.ts` → filas listas para `BusinessMember` (`emergencyContactName`, `emergencyContactPhone`). Mapeo igual que especialista en `registro.ts`.

**Tests de esta fase:** un test por parser con una muestra real anonimizada de la hoja correspondiente (extraída de `ANALISIS-DATOS-SALON.md`/Excel original, con nombres/teléfonos reemplazados). Verifica conteo de filas ok/error/sinMatch esperado.

## Fase 4 — Endpoints de import

- `app/api/import/preview/route.ts` (`POST`): recibe `multipart/form-data` con el archivo + `tipo` (uno de los 9). Lee `businessId` de la sesión (nunca del body). Llama al parser correspondiente. Devuelve `{ ok: [...], errores: [...], sinMatch: [...] }`. No escribe nada en la DB.
- `app/api/import/commit/route.ts` (`POST`): recibe el preview ya resuelto (filas ok + mapeos manuales de `sinMatch`) + `tipo`. Dentro de `prisma.$transaction()`:
  - Tipos 1–5, 8–9 → crea/actualiza los modelos correspondientes.
  - Tipos 6–7 (`totales`, `empleadas`) y la porción de producción de `bitacoraEventos` → no escribe `Appointment`/`Patient`/`Service`; calcula agregados desde `Appointment` ya existentes (reusar lógica de `app/api/reports/staff/route.ts` y `app/api/reports/revenue/route.ts` como referencia de cómo ya se agregan montos por trabajadora/método) y devuelve el reporte de discrepancias.
  - Todo el query scoping usa `businessId` de la sesión — mismo patrón que el resto de `app/api/citas/route.ts`.
  - Si algo falla a mitad de camino, rollback completo (gratis por usar `$transaction`).

**Tests de esta fase:** request con `businessId` de sesión A no puede leer/escribir nada de negocio B (mock de sesión + intento cruzado). Pago dividido: la suma de `paymentBreakdown` debe calzar con el precio total o la fila se marca error.

## Fase 5 — UI de import

- `components/app/layout/barra-lateral.tsx`: agregar item "Importar datos" a `itemsNavegacion`, condicionado a `esOwner` (mismo patrón que el item "Equipo" en la línea 118), ícono `Upload` de `lucide-react`, ruta `/dashboard/importar`.
- `app/dashboard/importar/page.tsx` + `app/dashboard/importar/_components/`:
  - `selectorTipoArchivo.tsx` — las 9 opciones de la sección 4.2 del spec.
  - `dropZone.tsx` — acepta `.xlsx`/`.xls`/`.csv`, valida extensión antes de subir.
  - `tablaRevision.tsx` — muestra filas ok/error/sinMatch; dropdown para mapear cada fila sin match a un miembro/cliente real o "omitir".
  - `resumenImportacion.tsx` — resultado final (importadas/omitidas/discrepancias si es tipo de verificación).
- Página solo accesible si `esOwner` (igual chequeo que ya existe para mostrar/ocultar "Equipo" en el sidebar — replicar el guard a nivel de página, no solo de nav).

## Fase 6 — Modal de citas (pago manual)

- `app/dashboard/calendario/_components/modalNuevaCita.tsx`: agregar a `FormNuevaCita` los campos `metodoPago`, `propina`, y si `metodoPago === "dividido"` un segundo método + monto. Select con las 10 categorías reales (sección 1 del spec) en vez de un input libre.
- `app/dashboard/calendario/page.tsx`: actualizar `FORM_INICIAL` y `crearCita` para enviar los campos nuevos.
- `app/api/citas/route.ts` y `app/api/citas/[id]/route.ts`: aceptar y persistir `paymentMethod`, `paymentBreakdown`, `tipAmount` en el body de creación/edición.

## Fase 7 — Testing de integración + QA manual

- Suite vitest completa (`npm run test`) con todo lo de fases 2–4 en verde.
- Checklist manual antes de mergear: importar un archivo de cada uno de los 9 tipos con datos de prueba (no los reales del salón) en un negocio de prueba, confirmar que no aparece nada en otro negocio de prueba, confirmar que correr el mismo archivo dos veces no duplica (al ser migración de una sola vez, duplicar es un riesgo aceptado y documentado — el checklist solo confirma que el usuario lo entiende, no que el sistema lo prevenga).

## Orden recomendado

Fase 0 → 1 → 2 → 3 → 4 → 6 (el modal de citas no depende de import y se puede hacer en paralelo a partir de la Fase 1) → 5 → 7.

Fases 2+3 (utilidades + parsers) son las más grandes; si se quiere paralelizar con subagentes, cada parser de la Fase 3 es independiente de los demás una vez que la Fase 2 está lista.
