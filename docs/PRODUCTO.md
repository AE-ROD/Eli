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

**El caso 3 nunca asume cero en silencio.** Una comisión sin configurar es un error de configuración, no una comisión de $0. Se muestra como pendiente y se le avisa al dueño; si no, se liquida de menos sin que nadie lo note.

**Por qué con herencia:** el dueño configura un porcentaje por persona y listo. Sólo define excepciones donde realmente las hay. No tiene que llenar una matriz de todos los profesionales por todos los servicios el primer día.

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

### 3.5 Auditoría

Todo cambio de porcentaje deja registro: **quién, cuándo, de qué valor a qué valor.** Es dinero — sin historial, una discusión entre dueño y profesional no se puede resolver.

### 3.6 Modelo de datos

```
BusinessMember.commissionPercent   Float?   → porcentaje por defecto del profesional
CommissionRate (memberId, serviceId, percent) → excepción puntual
VisitService.commissionPercent/Amount         → congelado al cobrar, en cada línea
CommissionChange (quién, cuándo, antes, después) → auditoría
```

> La rama `comisiones` (sin fusionar, nacida de `main`) guarda el congelado en la cita. Al integrarla hay que moverlo a las líneas de la atención.

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
- **Comisiones: ciclo completo** (configurar, calcular, liquidar, auditar)
- Elegir profesional al reservar — **pendiente, todavía no está construido**: hoy la página pública no lo ofrece y la reserva llega sin profesional asignado.
- Página pública de reservas
- Recordatorios automáticos por correo

**No entra:**
- Cobro online al cliente final
- Reportes exportables (sí se descargan en CSV los clientes y las atenciones de un rango: ver Clientes)
- Aplicación móvil nativa
- Multi-sucursal

**Zona horaria del negocio.** Cada negocio tiene su zona horaria (IANA, por defecto `America/Santiago`). En ella se leen sus horarios de atención y sus días: qué día de la semana es una fecha, qué horas ofrece la página pública (y cuáles ya pasaron hoy), en qué instante se guarda la cita reservada y qué citas trae la vista Día, Semana y Mes de la agenda. Si la zona guardada no es válida, se usa la de por defecto. Con el cambio de horario, una hora que no existe se corre hacia adelante lo que dura el salto y una que ocurre dos veces se toma la primera vez. **Todavía no hay pantalla para cambiarla** (sección 10).

**Mover una cita.** Desde el detalle de la cita, "Cambiar fecha y hora": fecha, hora de inicio, hora de fin y, para dueño y encargado, el profesional. El profesional mueve sólo sus citas y no las reasigna. Si el nuevo horario choca con otra cita del mismo profesional (las canceladas no cuentan) o queda fuera de su horario de atención —el suyo si cargó uno propio, si no el del negocio—, Eli avisa ("Carla ya tiene una cita de 10:00 a 11:00") y pregunta si se guarda igual: avisa, no bloquea. Si el negocio no cargó ningún horario, no avisa por horario. No se mueven las citas canceladas ni completadas, ni las que ya tienen una atención en el Tablero (salvo que esté anulada).

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
- **Editar y eliminar** son de dueño y encargado, desde la ficha. **Eliminar es anonimizar**, para cumplir el derecho a supresión: no queda ningún dato personal del cliente en ninguna tabla. No se deshace. Exactamente:
  - **En la ficha del cliente:** el nombre pasa a "Cliente eliminado"; apellido, correo, teléfono, cédula y notas quedan vacíos; las etiquetas se borran (queda sólo una marca interna que lo identifica como eliminado).
  - **En sus citas:** se borran las notas internas y los comentarios que dejó al reservar. Si la cita tiene un servicio del catálogo, su título vuelve a ser el nombre del servicio (el título es texto libre y alguien pudo escribir ahí algo del cliente). **Límite:** una cita sin servicio del catálogo conserva su título tal cual, porque no hay con qué reemplazarlo.
  - **En sus atenciones:** el nombre guardado pasa a "Cliente eliminado" y se borran las notas y el motivo de anulación (quién y cuándo anuló se conservan).
  - **No cambia:** fechas, horarios, servicios, profesionales, precios, líneas y pagos. Las citas y los cobros siguen atados al cliente eliminado, así que la agenda, las comisiones y los totales de los reportes suman lo mismo.
  - Deja de aparecer en Clientes, en los buscadores de "Nueva cita" y "Anotar sin reserva", y en las cifras de clientes del inicio (total y nuevos del mes).
  - Todo se hace junto: si algo falla, no se borra nada. Una edición, una cita nueva o una atención que se anota mientras se elimina no pueden devolverle sus datos: lo editado o lo nuevo de un cliente eliminado responde "no encontrado", y una llegada de su reserva queda a nombre de "Cliente eliminado".
  - **Pendiente:** los chats (`Conversation` y sus mensajes, hoy apagados) guardan nombre y teléfono sin enlace a la ficha del cliente, así que eliminarlo no los toca; hay que atarlos al cliente antes de volver a encenderlos. Y los correos que ya se le enviaron (recordatorios, confirmaciones) quedan en el historial del proveedor de correo (Resend), fuera de la base de Eli.

- **Teléfono:** se guarda en formato internacional (`+56912345678`) y se muestra con espacios (`+56 9 1234 5678`). Se acepta escrito de cualquier forma común ("9 1234 5678", "56912345678", un fijo "2 2345 6789"); uno que no se puede leer como número chileno es un error que dice cómo escribirlo. Los teléfonos guardados antes de este cambio no se reescribieron: se muestran igual de ordenados si se pueden leer.
- **Consentimiento de WhatsApp:** "Acepta recibir mensajes por WhatsApp" en el formulario del cliente (dueño y encargado). Marcarlo guarda cuándo y que fue desde el panel; desmarcarlo lo borra. Sin marcar, el cliente no tiene consentimiento.
- **Importar CSV** (Clientes → Importar CSV, dueño y encargado): un archivo de hasta 2 MB y 5.000 filas, separado por coma, punto y coma o tabulación, en UTF-8 o en el formato de Excel. Muestra las primeras filas y sugiere qué columna es cada dato por su título (Nombre, Apellido, Teléfono/Celular, Correo/Email, Notas, Acepta WhatsApp); nombre y apellido se juntan. **No crea repetidos:** una fila con el teléfono o el correo de un cliente que ya está en el negocio, o de una fila anterior del archivo, se omite. Al final dice cuántos se crearon, cuántos se omitieron por repetidos y cuáles tuvieron errores, con el número de fila y el motivo. Los importados no tienen consentimiento de WhatsApp salvo que el archivo traiga esa columna y diga que sí. Hasta 5 importaciones por hora por negocio.
- **Exportar** (dueño y encargado): los clientes del negocio, o las atenciones que llegaron entre dos días (hasta un año), en un CSV que abre Excel en español. Los clientes eliminados y sus atenciones no salen. Una celda que empieza con `=`, `+`, `-` o `@` lleva una comilla adelante para que la planilla no la ejecute como fórmula; al reimportar el archivo se quita. Hasta 20 descargas por hora por negocio.

### Horario

- Sin un horario guardado, la página pública no ofrece horas. Configuración muestra un ejemplo (lunes a viernes de 9 a 18), pero avisa que **todavía no está guardado** y destaca el botón para guardarlo. Cambiar de persona con cambios sin guardar pregunta antes de descartarlos.

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

**Al llegar, se precarga lo reservado.** "Llegó" sólo vale para reservas del día calendario de quien marca la llegada (si su dispositivo no informa una zona horaria que el servidor reconozca, para las que estén a menos de 24 horas de ahora). Si la cita tiene servicio y profesional, la atención nace con esa línea; si falta el profesional, el editor la propone y alguien lo elige. Un "Llegó" marcado por error se deshace mientras la atención no haya empezado, y la reserva vuelve a su columna. Si ya empezó, se anula: queda el rastro.

**El dueño también atiende.** El dueño no es miembro del equipo, así que sus líneas se marcan aparte como suyas y no generan comisión. Si quien hizo una línea deja el equipo, la línea conserva su nombre en el historial. Si todavía no se cobró, alguien tiene que reasignarla antes de cobrar.

**Pago dividido.** Medios fijos: efectivo, tarjeta de débito, tarjeta de crédito, transferencia y billetera digital. Un cobro se puede repartir entre varios medios. La suma tiene que coincidir con el total al centavo: se calcula en centavos enteros, nunca con decimales sueltos.

**Lo cobrado no se reescribe.** Una vez finalizada, la atención no se edita. Si hubo un error, el dueño la anula, también días después desde Reportes: queda en el historial de anuladas (quién, cuándo y por qué) y deja de sumar. El nombre de quien cobró y de quien anuló se guarda con la atención, y se conserva aunque esa persona deje el negocio. Si alguien se va sin ser atendido, también se anula.

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

---

## 8. Reportes

El historial de todo lo atendido y cobrado. Cada fila es una atención finalizada: fecha y hora del cobro, cliente, servicios con su profesional, total y medios de pago.

**Filtros**, combinables como quiera el administrador:
- período: hoy, ayer, esta semana, este mes o un rango de fechas;
- turno: mañana (antes de las 12), tarde (de 12 a 18) o noche (desde las 18);
- profesional, servicio y medio de pago.

**Resumen del período:** ingresos, cantidad de atenciones, ticket promedio, y desglose por medio de pago, por profesional y por servicio.

**Las cifras siguen al filtro.** Con un filtro de profesional o de servicio, los ingresos son la suma de los servicios que cumplen el filtro, no la atención entera: "Carla" muestra lo que generó Carla. Con un filtro de medio de pago, son lo que entró por ese medio. Si se combinan medio y profesional o servicio, el medio sólo decide qué atenciones entran (las que tienen algún pago con ese medio), y las cifras son los servicios que cumplen el filtro. Un pago no se puede atribuir a un servicio, así que el desglose que no corresponde no se muestra; en la tabla, las líneas que cumplen el filtro se destacan.

**Anuladas.** Dueño y encargado tienen una vista aparte con lo anulado en el período: quién, cuándo, por qué y si estaba cobrado. Desde el historial, el dueño puede anular un cobro de cualquier día.

**Quién ve qué.** Dueño y encargado ven todo el negocio. El profesional ve sólo sus propias líneas (lo que él atendió y cuánto sumó), sin los totales del negocio ni los medios de pago.

El día y el turno se calculan en la zona horaria del dispositivo de quien mira. Alcanza mientras el negocio y su equipo estén en el mismo huso; ver sección 10.

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
| **Comisiones en el tablero** | Integrar la rama `comisiones` sobre las líneas de atención (sección 3.6). |
| **Turnos y zona horaria** | Ya decidido: la zona horaria es **por negocio**, con `America/Santiago` por defecto (sección 6); la usan la reserva pública y la agenda. Falta: la pantalla para que el dueño la cambie, si los reportes, el inicio y "Llegó" pasan a usarla en vez de la zona del dispositivo (secciones 7 y 8), y si cada negocio define sus propios turnos. |
| **Corregir un cobro** | Hoy lo cobrado se anula, también días después desde Reportes. Falta decidir si el dueño puede reabrirlo y corregirlo, y con qué registro. |
| **Roles** | Si hace falta un super administrador de la plataforma, y si el cliente final puede crear cuenta para ver su historial y reprogramar. |
| **Clientes y el profesional** | Ya decidido: el profesional ve los clientes del negocio, puede crearlos (los necesita para anotar a quien llega) y editar sólo sus **notas**. Cambiar los datos (nombre, teléfono, email, etiquetas...) y borrar un cliente es de dueño y encargado. El servidor lo aplica con `puedeEditarDatosDeCliente` y `puedeBorrarCliente` (`lib/permisos.ts`). Importar y exportar clientes y atenciones en CSV también es de dueño y encargado (`puedeImportarExportarClientes`). |
| **Clientes: datos pendientes** | La exportación de atenciones excluye las de clientes eliminados, así que su total puede no coincidir con Reportes: decidir si se incluyen (ya anonimizadas, como "Cliente eliminado"). Los teléfonos guardados antes de normalizar no se migraron a `+56`. El cliente no tiene fecha de nacimiento, así que la importación no la lee. Fuera de la ficha de clientes (agenda, tablero) el teléfono se muestra todavía como está guardado. |
| **Chats** | Chats: escondido del panel hasta que exista un canal real (WhatsApp). Hoy los mensajes no le llegan al cliente, todos se guardan como 'del negocio' sin autor y la conversación no está ligada a la ficha del cliente. El código y las tablas se conservan. |
| **Branding** | Nombre definitivo (mantener *Eli* o cambiar), dominio, y tono: cercano o sobrio. |
| **Deuda: referido propio (B1)** | Un dueño puede ganar los 7 días extra creando una segunda cuenta con su enlace y reservando en ella. Acotado: se da una sola vez por negocio y todavía no hay cobro. Mitigación futura: contar el referido sólo cuando la cita se marca atendida, o exigir correo verificado. |
| **Deuda: correo sin verificar (B4)** | El registro con correo no verifica el email, así que la bienvenida y los correos de la prueba pueden llegarle a un tercero. Acotado por el rate limit del registro y el enlace de baja. Mitigación futura: verificación de correo. |
| **No funcionales** | Móvil primero (un barbero gestiona desde el teléfono); zonas horarias y país; sólo español o también inglés; política de privacidad y retención de datos de clientes. Mientras no existan los términos y la política de privacidad, crear cuenta no muestra la línea "aceptas los Términos y la Política de privacidad": enlazaba a páginas que no existen. Vuelve cuando estén. |
