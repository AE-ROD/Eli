# Eli — Definición de producto

> Fuente de verdad de qué construimos y por qué. Lo que todavía no está
> decidido vive en la sección 10, no en documentos aparte.

---

## 1. Qué es Eli

**Eli es el sistema de reservas que además reparte el dinero.**

Gestiona la agenda, los clientes y el equipo de negocios de belleza y cuidado personal — y resuelve algo que ninguna herramienta de agendamiento resuelve bien: **cuánto le corresponde a cada profesional por lo que atendió.**

### A quién le habla

Eli arranca con **tres rubros**:

| Rubro | Id interno (`Business.type`) |
|---|---|
| **Salones de belleza** | `salon` |
| **Barberías** | `barberia` |
| **Spas de uñas** | `spa-de-unas` |

El catálogo vive en un solo lugar, `lib/rubros.ts`; el registro sólo acepta esos tres.

**Por qué estos tres.** Comparten exactamente el modelo que Eli resuelve: atienden con reserva, trabajan con un equipo de profesionales y a cada profesional se le paga un porcentaje de lo que atiende. Elegir un nicho permite que el producto hable un solo idioma y sea el mejor en algo, en vez de servir a medias a siete rubros distintos.

> **Esto reemplaza una decisión anterior.** Antes Eli se ofrecía a "cualquier negocio que trabaje con reservas" y no nombraba rubros. Ahora sí se nombran: el mensaje, los ejemplos y las imágenes hablan de cortes, color, barba y manicura.

**Vocabulario:** se dice **"Clientes"** en toda la aplicación — nunca "pacientes" ni "usuarios". Quien atiende es **"profesional"**.

Los negocios que ya existen con otros rubros (`salud`, `fitness`, `otro`) siguen funcionando: el rubro es un dato de segmentación y no cambia la interfaz.

### Misión

Centralizar la información, eliminar el trabajo engorroso y construir soluciones donde hoy sólo hay problemas.

---

## 2. Diferenciador

Booksy, Fresha, Calendly y Agenda Pro compiten en **agendar**. Ninguna resuelve el **reparto**.

En salones, barberías y spas de uñas, quien atiende se lleva un porcentaje del servicio y el negocio retiene el resto. Hoy eso se hace con planilla, calculadora o memoria — y a fin de mes genera discusiones, errores y desconfianza.

**Eli lo resuelve dentro del mismo sistema donde ya vive la cita.** No hay que exportar nada ni recalcular a mano: si la cita se completó, la comisión ya está calculada.

**Esto no es una función más: es el centro del producto.** Y eso fija el estándar — no alcanza con configurar un porcentaje. Hay que cubrir el ciclo completo:

**configurar → calcular → liquidar → auditar**

Si un dueño no puede cerrar el mes con Eli, el diferenciador no existe.

**Cambiarse no cuesta.** Quien viene de Agenda Pro (u otra agenda) sube su base de clientes desde el CSV que exporta, y el negocio nace con servicios de ejemplo de su rubro: no arranca en blanco (sección 6).

---

## 3. Modelo de comisiones

### 3.1 Cómo se define el porcentaje

Modelo **profesional × servicio con herencia**. Resolución en cascada, del más específico al más general:

| Orden | Regla | Ejemplo |
|---|---|---|
| 1 | Porcentaje de **ese profesional en ese servicio** | Juan cobra 50% en Color |
| 2 | Porcentaje **por defecto del profesional** | Juan cobra 70% en todo lo demás |
| 3 | Sin configurar | La línea queda **pendiente de configurar** |
| — | **Producto** | El % del producto, para quien lo vendió (si no tiene, pendiente) |

La línea de la dueña no lleva comisión: no se la paga a sí misma.

**El caso 3 nunca asume cero en silencio.** Una comisión sin configurar es un error de configuración, no una comisión de $0. Se muestra como pendiente y se le avisa al dueño; si no, se liquida de menos sin que nadie lo note.

**Por qué con herencia:** el dueño configura un porcentaje por persona y listo. Sólo define excepciones donde realmente las hay. No tiene que llenar una matriz de todos los profesionales por todos los servicios el primer día.

**Dónde se configura.** La dueña fija en **Comisiones** el % por defecto de cada profesional y sus excepciones por servicio. Vacío es "sin configurar" (no es 0 %): lo cobrado queda pendiente hasta que se configure, y cada profesional muestra cuántos servicios suyos esperan %. Lo cobrado antes de "Liquidar desde" (3.7) no cuenta como pendiente: nunca va a entrar a una liquidación. El % de los productos se ve ahí y se edita en Configuración › Productos. Cada cambio queda en el historial (quién, cuándo, de cuánto a cuánto), incluidos los de quienes ya dejaron el equipo. El encargado y el profesional no ven esta sección.

### 3.2 Base de cálculo

Sobre el **precio de cada servicio cobrado**, sin descontar insumos. Es la línea de la atención (sección 7): servicio, profesional que lo hizo y precio. La cita es lo planeado; la atención es lo que realmente se hizo y se cobró, y una atención puede tener varios servicios hechos por distintas personas.

> ⚠️ **Riesgo asumido y documentado.** No contempla descontar materiales antes de repartir (relevante donde hay insumos caros, como tintura). Si aparece esa necesidad, agregarla implicará migrar datos ya cargados. Se acepta el riesgo para v1.

### 3.3 Congelado — la regla que no se negocia

**Al cobrar la atención, el porcentaje y el monto se guardan en cada línea.** No se recalculan nunca más.

Si el dueño le cambia el porcentaje a Juan hoy, **las atenciones de los meses anteriores conservan el porcentaje que tenían.** Sin esto, cada ajuste reescribe liquidaciones ya pagadas y las cuentas dejan de cerrar. Es el error clásico de los sistemas de comisiones y es carísimo de reparar una vez que hay datos.

### 3.4 Quién puede tocar qué

| | Configurar porcentajes | Ver liquidación de todos | Ver la propia |
|---|---|---|---|
| **Dueño** | ✅ | ✅ | — |
| **Encargado** | ❌ | ✅ | — |
| **Profesional** | ❌ | ❌ | ✅ |

El encargado gestiona la operación: equipo, agenda, horarios. **No define cuánto cobra cada uno.** Sí registra cobros en el tablero: es la caja del día y así lo decidió el dueño. Ver más permisos se puede abrir después; cerrarlos después es incómodo.

- **Productos:** el catálogo lo gestionan dueña y encargado; el % de cada producto, sólo la dueña (si lo manda el encargado, se rechaza).
- **Propinas:** las registra quien cobra (dueña y encargado).
- **Liquidaciones:** el período y "Liquidar desde" los elige sólo la dueña; la vista previa, cerrar, marcar pagada y anular, también. Adelantos y vales: dueña y encargado; ajustes: sólo la dueña (3.8).
- El profesional ve el % y el monto sólo de sus propias líneas.

### 3.5 Auditoría

Todo cambio de porcentaje deja registro: **quién, cuándo, de qué valor a qué valor.** Es dinero — sin historial, una discusión entre dueño y profesional no se puede resolver.

### 3.6 Modelo de datos

```
BusinessMember.commissionPercent   Float?   → % por defecto del profesional
CommissionRate (memberId, serviceId, percent) → excepción puntual
Producto.commissionPercent         Float?   → % de quien vende ese producto
VisitService.commissionPercent/commissionCents/commissionAt
                                            → congelado al cobrar, en cada línea
                                              (null = pendiente, nunca 0);
                                              tipo 'servicio' | 'producto'
PropinaDeAtencion                           → propinas, aparte de los pagos
CommissionChange (scope default | service | product; quién, cuándo, antes, después)
                                            → auditoría
```

Las columnas de comisión de `citas` (`commissionPercent`, `commissionAmount`, `commissionAt`) quedan sin uso: la comisión vive en la línea de la atención.

### 3.7 Liquidaciones

Cada negocio liquida al equipo con un período que elige sólo la dueña: **semanal** (con el día en que empieza la semana), **quincenal** (1 al 15 y 16 a fin de mes) o **mensual** (por defecto). Cambiar el período sólo afecta lo que viene.

**Liquidar desde.** Antes de la primera liquidación la dueña elige "Liquidar desde" (por defecto hoy, en la zona del negocio). Lo cobrado antes de esa fecha, sus propinas y los adelantos, vales y ajustes con fecha anterior nunca entran a una liquidación ni cuentan como pendientes de % (ni en Comisiones ni en Mi plata); un adelanto, vale o ajuste nuevo no se puede registrar con fecha anterior. Así lo que ya se pagó por fuera de Eli no se paga dos veces. Mientras no esté fijada no se puede ver la vista previa ni cerrar. Se puede cambiar sólo mientras no haya liquidaciones no anuladas; un cambio y un cierre no pasan a la vez.

**Qué cubre.** La liquidación de cada profesional va desde el día siguiente a su última liquidación no anulada (la primera, desde el inicio del período de lo más antiguo que tiene pendiente, o del de hoy si no tiene nada, pero nunca antes de "Liquidar desde") hasta el fin del período que contiene ese día, en la zona del negocio. Incluye sus servicios y productos cobrados y todavía sin liquidar (lo atrasado se arrastra), sus propinas, sus adelantos y vales (descuentan) y los ajustes (con signo y motivo).

**Total = comisiones + propinas − adelantos y vales + ajustes.**

La dueña ve una **vista previa** sin guardar. Lo que no tenía % al cobrar dice "se congelará al X %" y se congela al cerrar. No se cierra mientras haya líneas sin % configurado ni con el total negativo (los adelantos se pueden dejar para la siguiente). Cerrar, **marcar pagada** (con medio, quién y cuándo) y **anular** son de la dueña. Se anula sólo una cerrada no pagada: libera lo que incluía, y lo ya congelado queda congelado. Una atención incluida en una liquidación no se anula ni se reactiva su cita: se corrige con un ajuste.

### 3.8 Adelantos, vales y ajustes

Adelantos y vales los registran dueña y encargado; los ajustes, sólo la dueña y con motivo. No se borran: se anulan, mientras no estén en una liquidación.

### 3.9 Comprobante

Cada liquidación tiene un comprobante en el panel que se imprime o se guarda como PDF desde el navegador y se descarga en CSV. Compartir manda un resumen y el enlace interno: no hay enlace público. El profesional ve sólo los suyos.

### 3.10 Mi plata

Quien atiende (tiene un lugar en el equipo; la dueña no) ve lo que lleva ganado hoy, esta semana y en el período en curso: comisión ya calculada más propinas, por día de cobro en la zona del negocio. También cuántos servicios esperan porcentaje (sin monto), sus adelantos y vales por descontar y sus liquidaciones con comprobante. Nunca ve totales del negocio ni lo de otros.

---

## 4. Modelo de negocio

**Suscripción mensual por negocio.**

No se cobra comisión sobre las reservas. Eli **administra** el dinero del negocio, no lo toca. Cobrarle un porcentaje a quien usa Eli justamente para repartir porcentajes sería contradictorio, y además obligaría a procesar pagos de terceros.

### Precios (decidido)

En pesos chilenos, **con IVA incluido** y **cobro sólo mensual** (no hay plan anual). Los dos planes traen todas las funciones; lo único que cambia es cuántas personas atienden.

| Plan | Precio | Para quién |
|---|---|---|
| **Independiente** | $9.990/mes | Sólo el dueño atiende |
| **Equipo** | $34.990/mes con 5 personas que atienden incluidas, y **+$4.990/mes por cada persona adicional** | Negocios con equipo |

- **Prueba gratis de 7 días, sin tarjeta**, contados desde que se crea el negocio.
- **Correos del ciclo de prueba al dueño**, uno de cada tipo por negocio: bienvenida al crear el negocio (con los tres pasos: horario, servicios y compartir el enlace), un consejo el día 3 (compartir el enlace de reservas en Instagram y WhatsApp), un aviso cuando faltan 3 días y otro el último día. Los días se cuentan en la zona del negocio. No prometen cobro: dicen que todavía no se cobra y que pronto se podrá activar el plan desde el panel. Cada uno trae "Dejar de recibir estos correos", que los apaga (no los de la cuenta). Los negocios que existían antes no los reciben.
- **Referidos:** cada negocio tiene un enlace de invitación (`/crear-cuenta?invita=<código>`, también por Google). El invitado empieza con la prueba normal; cuando recibe su primera reserva por la página pública, quien lo invitó suma 7 días a su prueba (`DIAS_EXTRA_POR_REFERIDO`), contados desde su fin, o desde ese momento si ya había vencido, **una sola vez en total por negocio**. Cada invitado cuenta una vez, aunque quien invitó ya tenga su premio; el invitado puede invitar a otro y ganar sus propios días. El dueño ve su enlace y si ya sumó los días en el inicio del panel; de los invitados, sólo cuántos se registraron.
- **Quién cuenta como persona que atiende:** los profesionales siempre, y el dueño si atiende. El encargado no cuenta, salvo que el dueño le active que también atiende; ese interruptor llega junto con el cobro.
- **Los cambios en el equipo se cobran desde el mes siguiente**, sin cobros a medio mes.
- Los valores viven en `lib/precios.ts`: la landing, su calculadora y el modal de precios del panel leen de ahí.
- **Pasarela de pago: pendiente** (sección 10). Hoy no se cobra nada: el panel muestra los planes y avisa que activarlos llega pronto.

**Regla firme:** no se vende ninguna función que no exista. La versión anterior listaba "reportes exportables" en planes pagos sin haberlos construido — eso es motivo directo de reembolso.

---

## 5. Roles

| Rol | Alcance |
|---|---|
| **Dueño** | Todo, incluidos los porcentajes de comisión |
| **Encargado** | Equipo, agenda, horarios, clientes y cobros del tablero. Sin acceso a configuración de comisiones |
| **Profesional** | Su agenda, sus atenciones y su propia liquidación. Ve los clientes del negocio y los crea (los necesita para anotar a quien llega), pero en su historial sólo sus propias citas. De la ficha edita sólo las notas (sección 10) |
| **Cliente final** | Reserva desde la página pública, sin cuenta |

El profesional **no ve la facturación del negocio**, sólo lo suyo. Con comisiones de por medio, cuánto factura el local es información del dueño.

### Cuentas (decidido)

- **Una cuenta entra de una sola forma.** La que se creó con Google entra con Google; la que se creó con correo y contraseña (registro o invitación al equipo) entra con correo y contraseña. Si alguien intenta entrar con Google usando el correo de una cuenta con contraseña, Eli **no las vincula**: lo manda a iniciar sesión con el mensaje "Esta cuenta usa correo y contraseña. Entra con ellos.". Vincularlas sola le daría la cuenta a quien controle ese Gmail sin conocer la contraseña. Google además tiene que dar el correo como verificado.
- **El correo de una cuenta no distingue mayúsculas ni espacios en las puntas**: se guarda y se busca en minúsculas.
- **Las sesiones duran 7 días** y se revisan contra la base cada 5 minutos: a quien sacan del equipo o le cambian el rol, el cambio le llega en ese plazo. **Restablecer la contraseña cierra todas las sesiones abiertas** de esa cuenta.
- **Los enlaces de recuperar contraseña e invitación son de un solo uso** y la base guarda sólo su huella (hash), no el enlace.
- **Las invitaciones al equipo vencen a los 7 días.** En Equipo, cada invitación pendiente dice "Vence el …" o "Vencida", y dueño y encargado pueden **reenviarla** (enlace nuevo y 7 días más; el enlace anterior deja de servir) o **anularla**, con confirmación. Invitar de nuevo un correo con una invitación vencida la reemplaza; si está vigente, se ofrece reenviarla. Reenviar a un mismo correo tiene tope: 3 por hora.

---

## 6. Alcance de v1

**Entra:**
- Reservas, agenda y clientes
- **Tablero de atenciones**, con y sin reserva, y registro de cobros (sección 7)
- **Reportes** de lo atendido y cobrado, con filtros (sección 8)
- Equipo con los tres roles reales
- **Comisiones: ciclo completo** (configurar, calcular, liquidar, auditar), con liquidaciones, comprobantes y Mi plata (sección 3)
- **Productos y propinas** en el tablero, y **cierre de caja** (sección 7)
- Elegir profesional al reservar, o "cualquiera disponible" (abajo)
- Página pública de reservas
- Recordatorios automáticos por correo: uno por cita, el día anterior en la zona del negocio (abajo)
- **Avisos a clientes por correo:** lista de espera, "Te toca volver" y pedir reseña en Google, más la lista de clientes que se están yendo para escribirles a mano (abajo, "Mensajes a clientes")
- **Fila virtual** para atender por orden de llegada: el cliente se anota desde el celular y el local la muestra en una pantalla (sección 7, "Fila virtual")

**No entra:**
- Cobro online al cliente final
- Mensajes automáticos por WhatsApp, topes de mensajes por plan y packs (sección 10)
- Reportes exportables (sí se descargan en CSV los clientes y las atenciones de un rango, ver Clientes, y el comprobante de cada liquidación)
- Inventario de productos
- Retención de honorarios en la liquidación (decisión del dueño, sección 10)
- Aplicación móvil nativa
- Multi-sucursal

**Zona horaria del negocio.** Cada negocio tiene su zona horaria (IANA, por defecto `America/Santiago`). En ella se leen sus horarios de atención y sus días: qué día de la semana es una fecha, qué horas ofrece la página pública (y cuáles ya pasaron hoy), en qué instante se guarda la cita reservada y qué citas trae la vista Día, Semana y Mes de la agenda. Si la zona guardada no es válida, se usa la de por defecto. Con el cambio de horario, una hora que no existe se corre hacia adelante lo que dura el salto y una que ocurre dos veces se toma la primera vez. **Todavía no hay pantalla para cambiarla** (sección 10).

**Crear y mover una cita.** Desde el detalle de la cita, "Cambiar fecha y hora": fecha, hora de inicio, hora de fin y, para dueño y encargado, el profesional. El profesional mueve sólo sus citas y no las reasigna. Al crear o al mover, si el horario choca con otra cita del mismo profesional (las canceladas y las de "No vino" no cuentan), cae en un bloqueo del profesional o de todo el negocio, o queda fuera de su horario de atención —el suyo si cargó uno propio, si no el del negocio—, Eli avisa ("Carla ya tiene una cita de 10:00 a 11:00", "Carla tiene bloqueado de 13:00 a 14:00 (Almuerzo)") y pregunta si se guarda igual: en el panel avisa, no bloquea. Si el negocio no cargó ningún horario, no avisa por horario. No se mueven las citas canceladas, completadas ni de "No vino", ni las que ya tienen una atención en el Tablero (salvo que esté anulada).

**Bloqueos de horario.** "Bloquear horario" en la agenda cierra un tramo (almuerzo, trámite, feriado), con fecha y hora de inicio y de fin y un motivo opcional. Dueño y encargado bloquean a cualquier profesional o a todo el negocio; el profesional, sólo su propia agenda. En las vistas Día y Semana se ven como franjas grises; tocarlas muestra el detalle y, a quien puede, "Quitar bloqueo". El profesional ve los suyos y los de todo el negocio. Una cita encima de un bloqueo pide confirmación (arriba). La página pública no ofrece horas sobre un bloqueo (abajo).

**"No vino".** Una reserva pendiente o confirmada cuya hora ya pasó se marca "No vino": desde el detalle de la cita en la agenda o, si está atrasada, desde su tarjeta en "Reservas de hoy" del Tablero. No se puede si el cliente ya está en el Tablero (hay que deshacer la llegada) ni antes de la hora (si avisó, se cancela). Libera el horario como una cancelada, no se mueve, no recibe recordatorio y suma en la ficha del cliente (abajo). Se deshace reactivando la cita (abajo).

**Reactivar una cita.** Dueña y encargado pueden reactivar una cita cancelada (si todavía no empieza; se avisa si choca y se puede confirmar igual) o devolver a confirmada una completada o de "No vino", si no tiene una atención viva en el Tablero. Si esa atención ya entró en un cierre de caja o en una liquidación, no se reactiva: se corrige con un ajuste. El profesional no saca una cita de cancelada, completada o "No vino". Una completada ya no se cancela directo. Si otro cambia la cita mientras se reactiva, no se pisa su cambio.

**Recordatorios.** Un correo al cliente con email, una vez por cita, el día anterior en la zona del negocio, con la fecha y la hora de allá. No sale para las canceladas, las completadas ni las de "No vino". Lo manda un cron diario a las 13:00 UTC (~10:00 en Chile): el plan Hobby de Vercel no permite más de uno al día. Una cita creada después de esa hora para el día siguiente no recibe recordatorio.

**Servicios de ejemplo.** Un negocio nuevo (registro con correo o con Google) nace con 5 servicios comunes de su rubro, con duración, precio de referencia en pesos y categoría (`lib/servicios-de-ejemplo.ts`): corte, brushing y color en un salón; corte, barba y corte infantil en una barbería; manicure, esmaltado permanente, acrílicas y pedicure en un spa de uñas. Se crean junto con el negocio (si uno falla, no se crea ninguno de los dos) y se editan o borran como cualquier otro. Un rubro que el catálogo no conoce nace sin servicios.

**Horas de la agenda.** Las vistas Día y Semana muestran como mínimo de 8 a 20, y se amplían para incluir el horario de atención del negocio y cualquier cita fuera de ese rango. La vista Día lista todas las citas de cada hora; en la Semana, las que se pisan se dibujan lado a lado.

**Centro de soporte.** Las personas piden ayuda desde `/dashboard/ayuda` (con sesión) y `/soporte` (pública, sin sesión); las dos usan el mismo centro de ayuda y mandan a `POST /api/soporte`.

- **Tipos:** falla ("Algo no funciona"), reclamo y consulta ("Busco información"), cada una sobre un área (Agenda, Reservas en línea, Tablero del día, Clientes, Reportes, Equipo, Cuenta y plan u Otro). Antes del formulario se muestran las preguntas frecuentes (`lib/preguntas-frecuentes.ts`); en una falla, las que responden problemas típicos de esa área.
- **Número de caso:** cada solicitud se guarda (`SolicitudDeSoporte`) con un número correlativo que se muestra como `#000123`. Con sesión, quién escribe y de qué negocio salen de la sesión; sin sesión se piden nombre y correo y no se vincula negocio.
- **Correos:** el aviso completo va a la casilla de `SOPORTE_EMAIL` (sin ella, la solicitud se guarda igual y sólo queda un aviso en el log). A quien escribe le llega un acuse mínimo: sólo número, tipo y área, nunca el texto que escribió, para que nadie use el formulario para mandar texto propio a terceros. El acuse tiene tope por correo de destino; al pasarlo la solicitud se guarda y llega a soporte, sólo no sale el acuse.
- **Límites:** 5 solicitudes por hora, por usuario con sesión o por IP sin sesión; cuerpo de hasta 32 KB; campo trampa para bots.
- **Todavía no hay vista de administración:** las solicitudes se leen en la casilla de soporte o en la base. Responder, cambiar el estado o listarlas desde Eli queda pendiente.

---

### Clientes

- **Visitas:** una visita es una **atención cobrada** del tablero (sección 7), con o sin reserva. Una cita futura, cancelada o marcada completada en la agenda sin pasar por el cobro no cuenta. La tarjeta y la ficha muestran cuántas visitas tiene, cuándo fue la última y, si tiene una cita pendiente o confirmada por delante, cuándo es la próxima ("En 3 días"). El profesional cuenta sólo sus atenciones, como ve sólo sus citas.
- **Inasistencias:** la ficha muestra cuántas veces no vino (citas marcadas "No vino"; las canceladas no cuentan). El profesional cuenta sólo las suyas.
- **Editar y eliminar** son de dueño y encargado, desde la ficha. **Eliminar es anonimizar**, para cumplir el derecho a supresión: no queda ningún dato personal del cliente en ninguna tabla. No se deshace. Exactamente:
  - **En la ficha del cliente:** el nombre pasa a "Cliente eliminado"; apellido, correo, teléfono, cédula y notas quedan vacíos; las etiquetas se borran (queda sólo una marca interna que lo identifica como eliminado).
  - **En sus citas:** se borran las notas internas y los comentarios que dejó al reservar. Si la cita tiene un servicio del catálogo, su título vuelve a ser el nombre del servicio (el título es texto libre y alguien pudo escribir ahí algo del cliente). **Límite:** una cita sin servicio del catálogo conserva su título tal cual, porque no hay con qué reemplazarlo.
  - **En sus atenciones:** el nombre guardado pasa a "Cliente eliminado" y se borran las notas y el motivo de anulación (quién y cuándo anuló se conservan).
  - **No cambia:** fechas, horarios, servicios, profesionales, precios, líneas y pagos. Las citas y los cobros siguen atados al cliente eliminado, así que la agenda, las comisiones y los totales de los reportes suman lo mismo.
  - **Consentimientos y lista de espera:** se borran sus consentimientos de WhatsApp y de novedades por correo, y sus inscripciones en la lista de espera de ese negocio (las de su correo).
  - Deja de aparecer en Clientes, en los buscadores de "Nueva cita" y "Anotar sin reserva", y en las cifras de clientes del inicio (total y nuevos del mes).
  - Todo se hace junto: si algo falla, no se borra nada. Una edición, una cita nueva o una atención que se anota mientras se elimina no pueden devolverle sus datos: lo editado o lo nuevo de un cliente eliminado responde "no encontrado", y una llegada de su reserva queda a nombre de "Cliente eliminado".
  - **Pendiente:** los chats (`Conversation` y sus mensajes, hoy apagados) guardan nombre y teléfono sin enlace a la ficha del cliente, así que eliminarlo no los toca; hay que atarlos al cliente antes de volver a encenderlos. Y los correos que ya se le enviaron (recordatorios, confirmaciones) quedan en el historial del proveedor de correo (Resend), fuera de la base de Eli.

- **Teléfono:** se guarda en formato internacional (`+56912345678`) y se muestra con espacios (`+56 9 1234 5678`). Se acepta escrito de cualquier forma común ("9 1234 5678", "56912345678", un fijo "2 2345 6789"); uno que no se puede leer como número chileno es un error que dice cómo escribirlo. Los teléfonos guardados antes de este cambio no se reescribieron: se muestran igual de ordenados si se pueden leer.
- **Consentimiento de WhatsApp:** "Acepta recibir mensajes por WhatsApp" en el formulario del cliente (dueño y encargado). Marcarlo guarda cuándo y que fue desde el panel; desmarcarlo lo borra. Sin marcar, el cliente no tiene consentimiento.
- **Consentimiento de novedades por correo:** "Quiere recibir avisos y novedades de <negocio> por correo" en la ficha (dueño y encargado), y "Quiero recibir…" en la reserva pública. Marcarlo guarda cuándo y desde dónde; desmarcarlo en la ficha es darlo de baja. Sin él no le llegan "Te toca volver" ni el pedido de reseña (abajo, "Mensajes a clientes").
- **Importar CSV** (Clientes → Importar CSV, dueño y encargado): un archivo de hasta 2 MB y 5.000 filas, separado por coma, punto y coma o tabulación, en UTF-8 o en el formato de Excel. Muestra las primeras filas y sugiere qué columna es cada dato por su título (Nombre, Apellido, Teléfono/Celular, Correo/Email, Notas, Acepta WhatsApp); nombre y apellido se juntan. **No crea repetidos:** una fila con el teléfono o el correo de un cliente que ya está en el negocio, o de una fila anterior del archivo, se omite. Al final dice cuántos se crearon, cuántos se omitieron por repetidos y cuáles tuvieron errores, con el número de fila y el motivo. Los importados no tienen consentimiento de WhatsApp salvo que el archivo traiga esa columna y diga que sí. Hasta 5 importaciones por hora por negocio.
- **Exportar** (dueño y encargado): los clientes del negocio, o las atenciones que llegaron entre dos días (hasta un año), en un CSV que abre Excel en español. Los clientes eliminados y sus atenciones no salen. Una celda que empieza con `=`, `+`, `-` o `@` lleva una comilla adelante para que la planilla no la ejecute como fórmula; al reimportar el archivo se quita. Hasta 20 descargas por hora por negocio.

### Página pública del negocio

`/reservar/<slug>` muestra primero al negocio y debajo el flujo de reserva (`#reservar`):

- **Cabecera:** el color elegido (o su portada), el logo o sus iniciales, nombre, comuna y "Abierto ahora · cierra a las 20:00" / "Cerrado · abre mañana a las 10:00", calculado con el horario de atención en la zona del negocio. Quien atiende de noche carga dos franjas (hasta las 23:59 y desde las 00:00) y se leen como una. Sin horario no se muestra estado.
- **Botones:** Reservar, WhatsApp, Instagram y Cómo llegar (Google Maps o Waze, con dirección y comuna). Cada uno aparece sólo si hay dato; Cómo llegar pide dirección.
- **Equipo:** los profesionales (el encargado no, porque no cuenta como persona que atiende), con foto o iniciales, especialidad y "Reservar con <nombre>", que abre la reserva con ese profesional elegido.
- **Servicios** agrupados por categoría (los sin categoría van a "Otros"), con duración y precio; **horario** de lunes a domingo; **ubicación**; **medios de pago** del catálogo de cobro.
- **Color:** una paleta cerrada de 7 tonos del sistema de diseño (Cielo, Durazno, Lavanda, Pistacho, Menta, Arena, Noche); la marca de Eli no cambia. Cada uno pasa contraste AA con su texto. Un valor desconocido usa Cielo.
- **Al compartir el enlace:** título con nombre y comuna, descripción y una imagen generada (nombre, comuna, iniciales en el color del negocio).
- **Se edita** en Configuración → "Tu página pública": dirección, comuna, WhatsApp, Instagram (usuario o enlace del perfil), color con vista previa, medios de pago y especialidad de cada profesional. Dueño y encargado; el profesional la ve sin poder cambiarla. La categoría de cada servicio se pone en Servicios.
- **Fotos: próximamente.** Logo, portada y fotos de profesionales se muestran si existen y son del mismo sitio, pero no hay forma de subirlas ni se pueden pegar URLs (sección 10).

### Reserva por profesional

- **Quién atiende:** los profesionales (rol `worker`) que hacen el servicio. Cada uno hace todos los servicios hasta que dueño o encargado lo acotan en Equipo → "Servicios que hace" (casillas o "Todos los servicios"). El encargado y el dueño no se ofrecen (sección 10).
- **Elegir:** después del servicio, "¿Con quién?": "Cualquiera disponible" o una persona. Con una, se ven sólo sus horas libres; con cualquiera, toda hora en que al menos uno está libre, y al confirmar la cita va al libre con menos citas ese día (si empatan, siempre el mismo). Si en el instante de confirmar nadie quedó libre, "El horario ya no está disponible". `?profesional=<id>` en el enlace (el "Reservar con <nombre>" de la página) lo deja elegido y muestra sólo sus servicios; un id que no es de un profesional del negocio se ignora.
- **Qué ocupa a un profesional:** sus citas pendientes o confirmadas (las canceladas y las de "No vino" no), sus bloqueos y los de todo el negocio, y las citas **sin profesional asignado**, que ocupan a todos: así las reservas de antes de esto (que llegaron sin profesional) siguen bloqueando su hora. Su horario es el propio si cargó uno; si no, el del negocio.
- **Negocio sin profesionales** (el dueño solo, o con un encargado): funciona como siempre, un solo carril con el horario del negocio, ocupado por cualquier cita activa y por los bloqueos de todo el negocio. La cita llega sin profesional asignado.
- La página nunca ofrece una hora que después rechazaría: ofrecer y confirmar usan la misma regla.

### Varios servicios por reserva

- En la reserva pública se pueden elegir **hasta 4 servicios** (por ejemplo, corte + color). Los hace **una sola persona, seguidos**, en un bloque continuo: la cita dura la suma de las duraciones y cuesta la suma de los precios. Se marcan tocando cada tarjeta; con más de uno, cada tarjeta lleva su número de orden y se ve el total (duración y precio). Si alguno no tiene precio publicado, se suma lo que hay y se dice "+ a consultar".
- **Quién atiende:** sólo los profesionales que hacen **todos** los servicios elegidos. Si el elegido no hace uno que se suma, vuelve a "Cualquiera disponible".
- Las horas ofrecidas son las del bloque entero, con las mismas reglas de siempre; la duración y el precio los calcula Eli con el catálogo del negocio, nunca con lo que manda el navegador.
- La cita se ve en la agenda con los nombres unidos ("Corte + Color") y el precio total. Los correos y el recordatorio dicen todos los servicios. El enlace para cancelar o reagendar mueve el bloque entero; si alguno de los servicios se desactivó o se borró, sólo se puede cancelar.
- **Al llegar** (Tablero), la atención nace con una línea por servicio, cada una con el precio con que se reservó. Si alguno ya no está en el catálogo o no tiene precio, no se precarga ninguna (una parte cobraría de menos) y el editor se abre con la reserva.
- La lista de espera sigue siendo de un servicio: con varios elegidos, se anota el primero.
- Las citas del panel siguen con un servicio escrito a mano; elegir varios del catálogo desde el panel queda pendiente.

### Cancelar o reagendar sin cuenta

- El correo de confirmación trae "Cancelar o cambiar mi cita" (y la pantalla de reserva confirmada, el mismo enlace, para quien no dejó correo). Abre una página con la cita: negocio, servicio, profesional, día y hora en la zona del negocio.
- **Cancelar** la deja cancelada por el cliente, con la hora, y libera el horario. **Reagendar** ofrece otras horas libres del mismo servicio y profesional, con las reglas de la reserva. En los dos casos se le avisa al negocio por correo.
- **Plazo:** hasta 24 horas antes por defecto; dueño y encargado lo cambian en Configuración → "Plazo para cancelar o reagendar (horas)", de 0 a 72. Pasado el plazo la página muestra la cita y dice que hay que contactar al local.
- **El plazo se dice antes de reservar:** la cabecera de la página pública y el resumen del paso de confirmar muestran "Puedes cancelar o cambiar hasta 24 horas antes." (con el plazo del negocio; con 0 horas, "hasta el momento de la cita"). Es el mismo plazo que después aplica el enlace.
- Un enlace inválido, de una cita cancelada, pasada o ya atendida dice "Este enlace no sirve", sin más detalle. La base guarda sólo una huella del enlace (no el enlace), y cada enlace tiene su propio límite de uso además del de la IP.

### Reservas por confirmar tras faltas

- **Qué es:** si quien reserva por la página pública faltó ("No vino") N veces o más en el último año (365 días) en ese negocio, la reserva entra **por confirmar**: ocupa la hora como cualquier otra, pero el local decide si la acepta. Las faltas se buscan **sólo por el correo** de quien reserva (sin mayúsculas ni espacios en las puntas), sólo entre las citas de ese negocio y de clientes no eliminados. No por el teléfono: el correo de confirmación llega a la casilla que se escribió, así que con el teléfono de otra persona y un correo propio se podía averiguar si ese teléfono faltó. Una reserva sin correo nunca entra por confirmar.
- **Configurar:** Configuración → "Reservas por confirmar". Sólo la dueña: lo enciende o lo apaga y elige N, de 1 a 20 (al encenderlo se propone 2). Viene apagado.
- **Quien reserva no ve nada distinto:** la pantalla y la respuesta de la reserva son idénticas con o sin faltas, para no revelarle a quien escribió un correo o un teléfono si ese contacto faltó. Como las faltas se cuentan por el correo, el correo que dice "el local la confirmará" sólo le llega a la casilla de quien faltó. Sólo su correo cambia: "Recibimos tu reserva; el local la confirmará y te avisaremos por correo". El aviso al negocio dice que es una reserva por confirmar.
- **Resolver:** en la agenda se ve como "Por confirmar" (también en el inicio y en el historial del cliente). La dueña y el encargado la **confirman** (pasa a confirmada y al cliente le llega un correo) o la **cancelan**. El profesional la ve, pero no le puede cambiar el estado ni borrarla (el servidor responde 401); sí puede moverla o escribirle notas. La marca queda en la cita como registro de por qué se pidió. Si dos personas la confirman a la vez, el cliente recibe un solo correo.
- **Si llega al local:** registrar la llegada en el Tablero de una reserva por confirmar la da por resuelta: el cliente está en el local, así que no hace falta confirmarla antes ni se le manda el correo de confirmada.
- **Sin cobro:** no se pide abono. Un abono para quien ya faltó espera a la pasarela de pago.

### Teléfono y WhatsApp en la reserva

- El teléfono, opcional, se valida y se guarda como en el panel (`+56912345678`); uno que no se puede leer como chileno es un error que dice cómo escribirlo.
- Con teléfono aparece "Quiero recibir recordatorios por WhatsApp", sin marcar. Marcado guarda el consentimiento con su fecha y que vino de la reserva pública; no reemplaza uno anterior, y sin marcar no borra uno dado en el local. Todavía no se mandan mensajes por WhatsApp (sección 10).

### Horario

- Sin un horario guardado, la página pública no ofrece horas. Configuración muestra un ejemplo (lunes a viernes de 9 a 18), pero avisa que **todavía no está guardado** y destaca el botón para guardarlo. Cambiar de persona con cambios sin guardar pregunta antes de descartarlos.

### Mensajes a clientes

Todo sale por correo; WhatsApp todavía no (sección 10). Cada envío queda registrado sin datos personales (tipo, canal, si es de servicio o promocional) y ese registro es también el candado: una corrida repetida no manda dos veces lo mismo, y si el envío falla se reintenta. Los promocionales tienen un tope de 50 por negocio y día (en la zona del negocio), y cada corrida diaria, uno de 100 correos en total.

- **Interruptores.** En Configuración › Mensajes a clientes la dueña enciende o apaga cada uno: lista de espera (viene encendida), "Te toca volver" y "Pedir reseña en Google" (vienen apagados). El encargado los ve sin poder cambiarlos; el profesional no ve la sección.
- **Servicio y promocional.** La lista de espera es de servicio: le llega a quien se anotó. "Te toca volver" y la reseña son promocionales: sólo a quien marcó la casilla de novedades por correo (sin marcar por defecto), y cada correo trae la baja en un clic (también el "Cancelar suscripción" de Gmail y Apple). Después de la baja no le llega ninguno de los dos.
- **Cuándo salen.** La lista de espera, apenas se libera una hora. "Te toca volver", la reseña y el vencimiento de la lista de espera, una vez al día, dentro del cron de los correos de prueba (13:00 UTC): el plan Hobby de Vercel no admite un tercer cron.

**Lista de espera.** En la reserva pública, si el día elegido no tiene horas libres, la persona puede tocar "Avísame si se libera una hora" y dejar nombre, apellido, correo (obligatorio) y, si quiere, teléfono. Se anota para ese día, servicio y profesional (o "cualquiera"), sin franja horaria; si el día todavía tiene horas, o ese día no se atiende, se le dice. Un mismo correo puede esperar hasta 3 días a la vez en un negocio. Cuando se libera una hora futura (el cliente cancela o reagenda; el local cancela, mueve o borra una cita), Eli revisa quién esperaba ese día y si ahora hay hora para su servicio y profesional, y les manda un correo con la reserva ya llenada: hasta 10 personas por hora liberada, hasta 3 avisos por persona y no más de uno por hora. La hora es de quien confirme primero; al que llega después le dice "El horario ya no está disponible". Al reservar con el mismo correo para ese día, la inscripción queda como "reservó" y no se le vuelve a avisar. Cada aviso trae "Salir de la lista" (también en un clic). Al día siguiente las inscripciones vencen, y al vencer, reservar o salir se borran sus datos personales. Dueña y encargado ven la lista del día en la Agenda y pueden quitar a alguien. La casilla de novedades por correo de la reserva pública aparece sólo si se escribe un correo y se guarda sólo al crear un cliente nuevo: sobre un cliente que ya existía no se escribe (quien conoce su nombre y correo no puede dar el consentimiento por él).

**Te toca volver.** Si la dueña lo enciende, una vez al día sale un correo "Ya te toca volver" a los clientes con consentimiento cuando pasó su ritmo habitual desde la última visita y no tienen una hora tomada. El ritmo es la mediana de días entre sus visitas (con al menos 3); si no tiene, la frecuencia del servicio de su última visita, que la dueña o el encargado ponen en Configuración › Servicios ("Cada cuántos días vuelve un cliente", opcional, de 7 a 365 días); sin ninguna de las dos no se le escribe. Sale una vez por visita. Los días se cuentan en la zona del negocio.

**Se están yendo.** En Clientes, dueña y encargado ven quiénes no vienen hace 1,5 veces su ritmo o más y no tienen una hora tomada, con los días sin venir, su ritmo y su último servicio. "Escribirle" abre el WhatsApp o el correo de quien mira con un mensaje sugerido: lo manda la persona, sin costo. Queda anotado en "Mensajes de este mes" y el cliente sale de la lista por 14 días. El profesional no ve esta lista.

**Pedir reseña en Google.** El día siguiente a una visita finalizada (en la zona del negocio), a todos por igual, sin filtrar por cómo le fue, con un máximo de una vez cada 90 días por cliente. Una visita anulada no la pide. Necesita el enlace de reseñas en Configuración › Tu página pública (https de g.page, maps.app.goo.gl, google.com/maps o search.google.com/local/writereview): sin enlace no se enciende, y borrarlo lo apaga.

**Mensajes de este mes.** Una tarjeta en Configuración › Mensajes a clientes cuenta los envíos del mes por tipo, por servicio o promocional y por correo o manual.

---

## 7. Tablero de atenciones

Una **atención** es la visita de un cliente al local, con o sin reserva. El tablero muestra el día en columnas y es donde se anota qué se hizo, quién lo hizo y cuánto se cobró. **Los ingresos del negocio son lo cobrado acá.**

| Columna | Qué hay | Para pasar a la siguiente |
|---|---|---|
| **Reservas de hoy** | Las citas del día que todavía no llegaron, por hora. Entran solas. Si la hora pasó, se marcan como atrasadas. | "Llegó" (sólo para reservas del día) |
| **En espera** | Quien llegó, con o sin reserva, y espera ser atendido. | Al menos un servicio con su profesional |
| **En atención** | Quien está siendo atendido. | Cada servicio con su profesional y su precio |
| **Por cobrar** | Atendido; falta pagar ("por cancelar"). | Medios de pago que sumen exactamente el total |
| **Finalizado** | Lo cobrado hoy. Ya no se edita. | — |

**Cada servicio con su profesional.** Una atención tiene una o más líneas: servicio, profesional que lo hizo y precio cobrado. El precio se copia del catálogo y se puede ajustar; el total es la suma de las líneas. Así se sabe cuánto generó cada profesional, que es la base de las comisiones (sección 3). Topes: hasta 20 servicios y $20.000.000 por atención; más que eso es un error de carga, o dos atenciones. Los servicios se cuentan sobre la atención entera, para todos, también el profesional: cuántos servicios hay no es dinero. El monto se valida al anotar o editar los servicios, al pasar a "Por cobrar" y al cobrar, no al empezar ni al volver atrás, para que una atención que se pasó se pueda corregir. Al profesional el monto se le mide sobre sus propios servicios, porque un rechazo no puede revelarle cuánto suman los de sus colegas; el cobro valida siempre la atención entera.

**Al llegar, se precarga lo reservado.** "Llegó" sólo vale para reservas del día calendario de quien marca la llegada (si su dispositivo no informa una zona horaria que el servidor reconozca, para las que estén a menos de 24 horas de ahora). Si la cita tiene servicio y profesional, la atención nace con esa línea (con varios servicios, una por servicio; ver "Varios servicios por reserva"); si falta el profesional, el editor la propone y alguien lo elige. Un "Llegó" marcado por error se deshace mientras la atención no haya empezado, y la reserva vuelve a su columna. Si ya empezó, se anula: queda el rastro.

**El dueño también atiende.** El dueño no es miembro del equipo, así que sus líneas se marcan aparte como suyas y no generan comisión. Si quien hizo una línea deja el equipo, la línea conserva su nombre en el historial. Si todavía no se cobró, alguien tiene que reasignarla antes de cobrar.

**Productos.** Además de servicios, una atención puede llevar productos del catálogo (un shampoo, una cera), a nombre de quien los vendió. Sin inventario ni cantidad: dos unidades son dos líneas. Un producto inactivo no se agrega. Cuentan para el total y para el tope de 20 líneas. La página pública y la agenda no los muestran.

**La comisión se calcula al cobrar.** Cada línea guarda su % y su monto (sección 3.3). Una línea sin % no frena el cobro: queda pendiente y se avisa "… sin porcentaje de comisión: avísale a la dueña".

**Propinas.** Se anotan al cobrar, hasta 5 por cobro, para quien atendió. No suman al total ni a los ingresos (los pagos siguen sumando exactamente el total). Van completas al profesional y se le pagan en la liquidación; la de la dueña no entra a ninguna.

**Pago dividido.** Medios fijos: efectivo, tarjeta de débito, tarjeta de crédito, transferencia y billetera digital. Un cobro se puede repartir entre varios medios. La suma tiene que coincidir con el total al centavo: se calcula en centavos enteros, nunca con decimales sueltos.

**Lo cobrado no se reescribe.** Una vez finalizada, la atención no se edita. Si hubo un error, el dueño la anula, también días después desde Reportes: queda en el historial de anuladas (quién, cuándo y por qué) y deja de sumar. **Lo rendido no se anula:** una atención que ya entró en una liquidación no anulada o en un cierre de caja se corrige con un ajuste en la liquidación. Si un cierre (de caja o de liquidación) está en curso, cobrar, anular y reactivar una cita esperan a que termine: así no se cuela nada a mitad de un cierre. El nombre de quien cobró y de quien anuló se guarda con la atención, y se conserva aunque esa persona deje el negocio. Si alguien se va sin ser atendido, también se anula.

**La agenda se entera sola.** Al empezar la atención de alguien con reserva, su cita pasa a "en progreso"; al cobrarla, a "completada". El precio de la cita no cambia: lo cobrado vive en la atención, y el total puede incluir servicios de otros profesionales que quien atendió la cita no debe ver. Una cita marcada como completada en la agenda sin pasar por el cobro **no suma ingresos**: no hay registro de cuánto se cobró ni cómo. Si se anula la atención de una reserva antes de cobrarla, la cita queda cancelada (salvo que alguien ya la haya completado o cancelado a mano en la agenda: esa decisión no se pisa) y atada a esa atención; si la persona vuelve ese día, se la anota sin reserva.

| | Dueño | Encargado | Profesional |
|---|---|---|---|
| Ver el tablero | Todo | Todo | Sus atenciones y sus reservas |
| Anotar a alguien sin reserva | ✅ | ✅ | ✅, asignado a sí mismo |
| Mover hasta "Por cobrar" y editar servicios | ✅ | ✅ | Sólo sus atenciones y sus líneas |
| Deshacer un "Llegó" | ✅ | ✅ | Sólo sus reservas |
| Cobrar | ✅ | ✅ | ❌ |
| Anular antes de cobrar | ✅ | ✅ | ❌ |
| Anular algo ya cobrado | ✅ | ❌ | ❌ |
| Ver las anuladas | ✅ | ✅ | ❌ |
| Registrar propinas | ✅ | ✅ | ❌ |
| Cerrar la caja y ver los cierres | ✅ | ✅ | ❌ |

### Fila virtual

Para los locales que atienden por orden de llegada (barberías, sobre todo). El cliente se anota desde su celular, espera donde quiera y vuelve cuando le toca.

- **Quién la enciende.** Sólo la dueña, en Configuración › Fila virtual: encendida o apagada (viene apagada) y el **máximo de personas esperando** a la vez, de 1 a 100 (viene en 15). Ahí mismo ve el enlace para anotarse. Apagarla no saca a nadie: quienes ya esperan siguen en el Tablero; sólo impide que se anoten más.
- **Cómo se anota el cliente.** En `/fila/<su-página>` (el enlace o el QR de la pantalla del local) escribe su nombre y, si quiere, su correo. Sólo mientras el local está abierto según su horario de atención y su zona horaria; fuera de horario la página lo dice. Si ya hay tantas personas esperando como el máximo, la fila está "llena por ahora". Con la fila apagada, la página no existe. Toma el número siguiente del día (1, 2, 3…; cada día empieza en 1 y un número nunca se repite, aunque alguien haya salido).
- **Qué ve en el celular.** Su número en grande, cuántas personas tiene adelante y un tiempo estimado, que se actualizan solos cada 20 segundos. La estimación es personas adelante × la duración promedio de los servicios activos del negocio (entre 5 y 120 minutos por persona; 20 si no hay servicios), redondeada a 5 minutos: es una cota gruesa, no cuenta que varios profesionales atienden a la vez. No ve nombres ni datos de nadie más. Puede **salir de la fila**: su atención queda anulada. Cuando lo empiezan a atender, la página dice "Es tu turno". El enlace es personal (lleva un código que sólo existe en ese enlace).
- **En el Tablero.** Quien se anota entra en "En espera" como cualquier llegada sin reserva, con su número ("Turno 7"). Se atiende, se cobra o se anula igual que las demás (anular a quien no vino es "se fue sin ser atendido").
- **Pantalla del local.** Dueña y encargado la abren desde el Tablero ("Pantalla de la fila", cuando está encendida). Es para un televisor o una tablet: usa la sesión de quien la abre, así que en ese equipo queda abierto el panel de esa cuenta (Configuración lo advierte: no dejar el panel a mano de los clientes). Tapa el panel, tiene botón de pantalla completa y se actualiza sola cada 15 segundos. Muestra quién se está atendiendo y la fila de espera, con el número y el nombre con la inicial del apellido ("Juan P."), nunca el correo ni el teléfono, y en grande el QR y el enlace para anotarse. El profesional no la ve.
- **Aviso "ya casi es tu turno".** A quien dejó su correo le llega un correo una sola vez, cuando queda con una persona adelante (o con ninguna, si salieron dos a la vez). Lo saluda sólo por su primer nombre. Sale cuando alguien de la fila deja de esperar (pasa a atención, sale o lo anulan) y cuando alguien se anota, por si quedó con una o ninguna persona adelante. Es de servicio (lo pidió al anotarse) y no trae enlace a su turno: Eli no guarda el código del enlace, sólo una huella. Si el envío falla, se reintenta en el siguiente movimiento de la fila.
- **Vaciar la fila de hoy.** Dueña y encargado, desde el Tablero cuando hay alguien esperando en la fila (aunque esté apagada): anula de una vez a todos los que esperan en la fila del día, después de confirmarlo. Los que ya se atienden siguen. Sirve si alguien la llenó con nombres inventados. Cada atención anulada guarda quién la vació.
- **Límites.** Desde una misma conexión, 10 intentos por hora (los clientes en el wifi del local comparten conexión). Por negocio, 60 anotaciones por hora: sólo cuentan las que quedaron anotadas, no los intentos rechazados (local cerrado o fila llena), para que nadie pueda gastar ese cupo y dejar afuera a la gente real. El nombre, hasta 40 caracteres. Mirar el turno, unas 4 consultas por minuto por enlace.

### Cierre de caja

Dueña y encargado cierran la caja cuantas veces quieran al día. Cada cierre cubre desde el anterior (el primero, desde el inicio del día en la zona del negocio) hasta el momento de cerrar. **Esperado = fondo inicial + efectivo cobrado + propinas en efectivo**; se anota lo contado y la diferencia, con nota obligatoria si no cuadra. Los otros medios se muestran sólo como referencia. Los adelantos pagados desde la caja no cuentan en esta versión. Un cierre no se edita, y lo cobrado dentro de un cierre ya no se anula ni se reactiva su cita.

---

## 8. Reportes

El historial de todo lo atendido y cobrado. Cada fila es una atención finalizada: fecha y hora del cobro, cliente, servicios con su profesional, total y medios de pago.

**Filtros**, combinables como quiera el administrador:
- período: hoy, ayer, esta semana, este mes o un rango de fechas;
- turno: mañana (antes de las 12), tarde (de 12 a 18) o noche (desde las 18);
- profesional, servicio y medio de pago.

**Resumen del período:** ingresos, cantidad de atenciones, ticket promedio, y desglose por medio de pago, por profesional y por servicio. Los productos se desglosan por producto, y el filtro de servicio también elige un producto. Las propinas no son ingresos.

**Las cifras siguen al filtro.** Con un filtro de profesional o de servicio, los ingresos son la suma de los servicios que cumplen el filtro, no la atención entera: "Carla" muestra lo que generó Carla. Con un filtro de medio de pago, son lo que entró por ese medio. Si se combinan medio y profesional o servicio, el medio sólo decide qué atenciones entran (las que tienen algún pago con ese medio), y las cifras son los servicios que cumplen el filtro. Un pago no se puede atribuir a un servicio, así que el desglose que no corresponde no se muestra; en la tabla, las líneas que cumplen el filtro se destacan.

**Anuladas.** Dueño y encargado tienen una vista aparte con lo anulado en el período: quién, cuándo, por qué y si estaba cobrado. Desde el historial, el dueño puede anular un cobro de cualquier día.

**Quién ve qué.** Dueño y encargado ven todo el negocio. El profesional ve sólo sus propias líneas (lo que él atendió y cuánto sumó), sin los totales del negocio ni los medios de pago.

El día y el turno se calculan en la zona horaria del dispositivo de quien mira. Alcanza mientras el negocio y su equipo estén en el mismo huso; ver sección 10.

**Llenar horas** (pestaña aparte, dueña y encargado), en la zona del negocio: ocupación por profesional (citas dentro de su horario, menos bloqueos), clientes nuevos y que volvieron, tasa de "No vino", y la comparación con el período anterior de igual largo.

---

## 9. Branding — dirección propuesta

> Pendiente de decidir. Esta es la dirección que se desprende del posicionamiento.

Con el diferenciador definido, la identidad ya no debería comunicar "agenda bonita" sino **claridad y confianza con el dinero**. Un producto que reparte plata entre personas tiene que verse exacto, no simpático.

| Elemento | Dirección |
|---|---|
| **Nombre** | A decidir: mantener *Eli* o cambiar |
| **Tono** | Claro y directo. Nada de jerga técnica ni de promesas infladas |
| **Atributos** | Exactitud, transparencia, calma |
| **Evitar** | Rubros fuera de los tres elegidos (consultorios, gimnasios, yoga); cifras no verificables |

**Frase de cierre vigente:** *Deja de complicarte. Pásate a Eli.*

La paleta y la tipografía de la landing ya están propuestas en `docs/diseno/README.md`.

---

## 10. Pendiente de definir

Nada de esto bloquea el trabajo actual, pero cada punto se decide antes de construir lo que depende de él.

| Tema | Qué falta decidir |
|---|---|
| **Cobro** | Los precios ya están decididos (sección 4). Falta la pasarela de pago: Flow quedó descartado (su cargo automático es sólo para empresas) y Mercado Pago está en evaluación. Con el cobro llegan también el interruptor "también atiende" del encargado, qué pasa al terminar la prueba sin plan (y con eso, qué dicen los correos de fin de prueba, que hoy sólo avisan que el cobro llega pronto) y cómo el sistema lleva la cuenta de las personas que atienden. |
| **Códigos promocionales** | Idea aprobada, sin construir. Primero, códigos que alargan la prueba gratis (no dependen de la pasarela); el descuento sobre el primer mes, después de que el cobro funcione. Reglas: uno por negocio y una sola vez, con vencimiento y cupo, no acumulables, sólo los aplica el dueño, validados en el servidor con rate limit y con sus condiciones visibles al aplicarlos. Falta decidir: si el descuento es porcentaje o monto fijo y si cubre las personas adicionales, dónde se ingresa (al crear la cuenta o al activar el plan) y quién crea los códigos (en v1, por SQL). |
| **Precio de fundador** | Decidido en principio: precio garantizado (quien se suscribe antes de una fecha mantiene su precio por un tiempo, p. ej. 12 meses) y descuento de fundador. Descartado el precio congelado de por vida. Los dos se construyen cuando exista el cobro; falta definir la fecha de corte, la duración de la garantía y el monto del descuento. |
| **Wallet** | En espera. Apple Wallet exige el Apple Developer Program pagado (los intermediarios gratis firman con certificados ajenos, contra la licencia de Apple). Google Wallet sería gratis y acepta personas naturales, pero pide cuenta de emisor con aprobación manual de Google, sirve sólo en Android y manda datos de la reserva a Google (EE. UU.), lo que debe declararse en la política de privacidad. Mientras tanto, la reserva se agrega al calendario (.ics y Google Calendar). |
| **Funciones nuevas** | El resto del listado de ideas por incorporar, con qué problema resuelve cada una y si es imprescindible para vender. |
| **Dinero** | Ya decidido: `Decimal` como formato único (como en comisiones / F-015). Hoy conviven Float (`Service.price`, `Appointment.price`) y centavos Int (tablero); migrarlos es una tarea aparte que cambia el esquema y se ensaya primero en una base de desarrollo, nunca directo en producción. |
| **Dinero ya rendido** | Ya decidido (etapa 2): lo que entró en un cierre de caja o en una liquidación no anulada no se anula ni se reactiva su cita; se corrige con un ajuste. Cobrar, anular y reactivar esperan al cierre en curso, y "Liquidar desde" no cambia en medio de un cierre (secciones 3.7, 6 y 7). |
| **Retención de honorarios** | Fuera, por decisión del dueño: la liquidación no retiene impuestos ni calcula boletas de honorarios. |
| **Turnos y zona horaria** | Ya decidido: la zona horaria es **por negocio**, con `America/Santiago` por defecto (sección 6); la usan la reserva pública, la agenda y los recordatorios. Falta: la pantalla para que el dueño la cambie, si los reportes, el inicio y "Llegó" pasan a usarla en vez de la zona del dispositivo (secciones 7 y 8), y si cada negocio define sus propios turnos. |
| **Agenda: bloqueos y "No vino"** | Ya decidido: "No vino" se deshace reactivando la cita (dueña y encargado, sección 6). Muchas inasistencias ya tienen consecuencia: la reserva entra por confirmar (sección 6, "Reservas por confirmar tras faltas"). Con el plan Pro de Vercel, el recordatorio podría salir a una hora fija en la zona de cada negocio. |
| **Página pública: fotos** | La página ya muestra logo, portada y fotos del equipo si existen, pero no hay subida: falta aprobar el almacenamiento (propuesto Cloudflare R2), y con él abrir la CSP (`img-src`) a ese origen. Hasta entonces se usa el color y las iniciales. También falta decidir si el encargado que atiende aparece en "Equipo" (llega con el interruptor "también atiende"). |
| **Corregir un cobro** | Hoy lo cobrado se anula, también días después desde Reportes, salvo que ya haya entrado en un cierre de caja o en una liquidación: entonces se corrige con un ajuste. Falta decidir si el dueño puede reabrirlo y corregirlo, y con qué registro. |
| **Roles** | Si hace falta un super administrador de la plataforma, y si el cliente final puede crear cuenta para ver su historial (cancelar y reagendar ya se hace sin cuenta, con el enlace del correo). |
| **Reserva por profesional** | Hoy sólo se ofrecen los profesionales: el dueño que también atiende y el encargado con "también atiende" entran con ese interruptor (fila Cobro). Las citas sin profesional asignado ocupan a todos; falta decidir si el panel ofrece asignarlas. Al reagendar se mantiene el profesional; cambiarlo desde el enlace no está. El aviso de cancelación o cambio va al correo del dueño, no al del profesional. |
| **Clientes y el profesional** | Ya decidido: el profesional ve los clientes del negocio, puede crearlos (los necesita para anotar a quien llega) y editar sólo sus **notas**. Cambiar los datos (nombre, teléfono, email, etiquetas...) y borrar un cliente es de dueño y encargado. El servidor lo aplica con `puedeEditarDatosDeCliente` y `puedeBorrarCliente` (`lib/permisos.ts`). Importar y exportar clientes y atenciones en CSV también es de dueño y encargado (`puedeImportarExportarClientes`). |
| **Clientes: datos pendientes** | La exportación de atenciones excluye las de clientes eliminados, así que su total puede no coincidir con Reportes: decidir si se incluyen (ya anonimizadas, como "Cliente eliminado"). Los teléfonos guardados antes de normalizar no se migraron a `+56`. El cliente no tiene fecha de nacimiento, así que la importación no la lee. Fuera de la ficha de clientes (agenda, tablero) el teléfono se muestra todavía como está guardado. |
| **Mensajes a clientes** | Ya construido por correo (sección 6, "Mensajes a clientes"). Esperan la SpA y la decisión de precios: los mensajes por WhatsApp (y con ellos el ofrecimiento de a uno, "el primero y a los 10 minutos el siguiente", de la lista de espera), los topes de mensajes por plan, el aviso al 80 % y los packs. Falta confirmar con el plan de Resend el tope de 100 correos por corrida: el gratuito comparte unos 100 al día con los recordatorios y los correos de prueba. Decidido por los agentes, a confirmar: una hora entre avisos a la misma inscripción, 14 días oculto tras "Escribirle", 2 años de historial para el ritmo, y que una reseña que no salió en su corrida no se reintenta al día siguiente. |
| **Notificaciones push** | Fuera de esta etapa (#112). |
| **Chats** | Chats: escondido del panel hasta que exista un canal real (WhatsApp). Hoy los mensajes no le llegan al cliente, todos se guardan como 'del negocio' sin autor y la conversación no está ligada a la ficha del cliente. El código y las tablas se conservan. |
| **Branding** | Nombre definitivo (mantener *Eli* o cambiar), dominio, y tono: cercano o sobrio. |
| **Deuda: referido propio (B1)** | Un dueño puede ganar los 7 días extra creando una segunda cuenta con su enlace y reservando en ella. Acotado: se da una sola vez por negocio y todavía no hay cobro. Mitigación futura: contar el referido sólo cuando la cita se marca atendida, o exigir correo verificado. |
| **Deuda: correo sin verificar (B4)** | El registro con correo no verifica el email, así que la bienvenida y los correos de la prueba pueden llegarle a un tercero. Acotado por el rate limit del registro y el enlace de baja. Mitigación futura: verificación de correo. |
| **No funcionales** | Móvil primero (un barbero gestiona desde el teléfono); zonas horarias y país; sólo español o también inglés; política de privacidad y retención de datos de clientes. Mientras no existan los términos y la política de privacidad, crear cuenta no muestra la línea "aceptas los Términos y la Política de privacidad": enlazaba a páginas que no existen. Vuelve cuando estén. |
