# Análisis: datos reales de D'Chamas vs. esquema de Eli

Comparación de las 10 hojas del Google Sheet real del salón (Irarrázaval 1970 + Local 45A + Local 10B) contra el modelo de datos y los reportes actuales de Eli, antes de tocar código o base de datos.

## Hallazgo de fondo

El salón no usa la planilla como fuente única: ya opera con **Fresha** (app de reservas externa — columna "FRESHA" en REGISTRO) y Google Calendar para agendar, más WhatsApp para confirmaciones (columna "MENSAJE" en CLIENTES). La planilla es una **reconciliación contable manual** sobre esos sistemas — qué se vendió, cómo se pagó, cuánto se depositó vía Haulmer (procesador de pago/POS), y quién trabajó cada día. Esto importa porque "centralizar en Eli" puede significar dos cosas distintas: (a) importar el histórico tal cual quedó registrado, o (b) que Eli reemplace Fresha + planilla hacia adelante como sistema operativo del negocio. Ver decisión 4 más abajo.

## Mapeo hoja por hoja

| Hoja | Qué contiene realmente | Equivalente actual en Eli | Nivel de match |
|---|---|---|---|
| PRECIOS | Lista de precios y servicios (manicure, pedicure, depilación, cejas/pestañas, maquillaje, productos, tarjetas de fidelización/giftcard) | `Service` (name, price, duration) | Alto |
| REGISTRO | Log diario lunes–sábado: trabajadora, servicio, monto, método de pago, propina, flags EXCEL/FRESHA, ventas de producto, pagos divididos | `Appointment` + `ShiftClose.paymentBreakdown` | Parcial |
| Reg. Domingo | Igual que REGISTRO pero solo domingos, a cargo de una colaboradora distinta (ARANZA C.), con conciliación del depósito Haulmer→Banco Estado | Igual que arriba, sin nada para reconciliación bancaria | Parcial |
| CLIENTES | No es un CRM — es la bitácora diaria de citas (fecha, especialista, teléfono, nombre, email); ~500 filas, ~20+ con errores #REF!/#ERROR! de fórmulas rotas | `Appointment` + `Patient` combinados | Parcial |
| CAJA CHICA | Apertura/cierre de caja, conteo de efectivo por denominación de billete/moneda, gastos itemizados (ej. "bolsa de hielo $1.000") | `ShiftClose` (solo totales: cashOpening/Closing) | Parcial |
| BITACORA DE EVENTOS | No es un log de incidentes — es producción diaria por trabajadora (servicios + $), con una lista de contactos de "agenda y no asiste" | Reportería de staff, no `ShiftNote` | Bajo (el nombre de la hoja engaña) |
| TOTALES | Resumen mensual/semanal por método de pago + verificación Haulmer | `RevenueResponse.byPaymentMethod` | Alto |
| EMPLEADAS | Producción diaria por trabajadora mes a mes; alta rotación de personal | `StaffResponse` | Alto en concepto, pero el personal real es informal |
| NO AGENDAR | Lista negra de clientes con teléfono/email/motivo (malas reseñas, reclamos SERNAC, no pago) | No existe (podría reusar `Patient.tags`) | Nuevo |
| DATOS | Config: 3 locales con personal propio, 10 categorías de pago reales, contactos de emergencia del personal | No existe modelo de "Local"; `PaymentMethod` solo tiene 5 valores | Nuevo/Parcial |

## Hallazgos que cambian el enfoque

**Multi-local confirmado.** Irarrázaval 1970 (principal), Local 45A, Local 10B, cada uno con su propio personal. Eli modela un `Business` único por slug, sin sub-unidades de local — esto es lo más sensible de tocar porque `businessId` vive en el JWT (regla NEVER-change de CLAUDE.md).

**Personal informal con alta rotación.** Solo en REGISTRO (5 semanas) aparecen 9 nombres distintos, con "VACANTE" cuando falta cubrir un turno, y colaboradoras como ARANZA C. que trabajan solo domingos bajo otro esquema. `BusinessMember` en Eli exige una cuenta `User` real por persona.

**Métodos de pago más ricos.** 10 categorías reales (CREDITO, DEBITO, EFECTIVO, TRANSFERENCIA, CORTESÍA/PREMIO, GARANTÍA, GIFTCARD, REEMBOLSO, TARJETA DE FIDELIZACIÓN, INTERCAMBIO DE SERVICIO) + "Pago Dividido" combinando dos métodos. El enum `PaymentMethod` de Eli solo tiene 5.

**Propinas por línea**, no solo por turno como hoy en `ShiftClose.tipsTotal`.

**Caja chica itemizada** por descripción de gasto y conteo por denominación — `ShiftClose` solo guarda totales.

**Lista negra de clientes** sin ningún campo equivalente hoy en `Patient`.

## Decisiones necesarias antes de avanzar

Te las planteo en la app (4 preguntas). Quedan fuera de esa ronda, como propuesta de default a confirmar después:
- **NO AGENDAR**: usar `Patient.tags` (ej. tag "no-agendar") + `notes` con el motivo, sin construir un bloqueo automático de reservas en esta fase — dime si prefieres lo contrario.
- **Propinas/caja chica al detalle**: una vez resuelto el modelo de personal y locales, propongo extender `ShiftClose` con un campo de gastos itemizados (Json) en vez de crear un modelo nuevo — confirmable más adelante.

## Próximo paso

Con las 4 decisiones resueltas: diseño del mapeo de importación (Service, Patient/Appointment, ShiftClose, BusinessMember), cualquier cambio de esquema necesario, y ajuste de los paneles de `/dashboard/reportes` para igualar las categorías reales del salón.
