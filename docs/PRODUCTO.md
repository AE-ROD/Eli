# Eli — Definición de producto

> Fuente de verdad de qué construimos y por qué. Lo que todavía no está
> decidido vive en la sección 10, no en documentos aparte.

---

## 1. Qué es Eli

**Eli es el sistema de reservas que además reparte el dinero.**

Gestiona la agenda, los clientes y el equipo de negocios de belleza y cuidado personal, y de clínicas dentales — y resuelve algo que ninguna herramienta de agendamiento resuelve bien: **cuánto le corresponde a cada profesional por lo que atendió.**

### A quién le habla

Eli atiende **cuatro rubros**:

| Rubro | Id interno (`Business.type`) |
|---|---|
| **Salones de belleza** | `salon` |
| **Barberías** | `barberia` |
| **Spas de uñas** | `spa-de-unas` |
| **Clínicas dentales** | `odontologia` |

El catálogo vive en un solo lugar, `lib/rubros.ts`; el registro sólo acepta esos cuatro. El rubro se elige al crear la cuenta (o al completar el perfil después de entrar con Google) y no se cambia después.

**Por qué estos rubros.** Comparten exactamente el modelo que Eli resuelve: atienden con reserva, trabajan con un equipo de profesionales y a cada profesional se le paga un porcentaje de lo que atiende. Elegir un nicho permite que el producto hable un solo idioma y sea el mejor en algo, en vez de servir a medias a siete rubros distintos.

**La clínica dental, el cuarto.** También atiende con reserva y con un equipo (odontólogos que trabajan en sillones), y además lleva lo clínico de cada paciente: ficha, odontograma, evoluciones y plan de tratamiento. Por eso es el único rubro que **cambia la interfaz** (sección 6, "Clínica dental"). La comisión sigue como en los otros rubros.

> **Esto reemplaza una decisión anterior.** Antes Eli se ofrecía a "cualquier negocio que trabaje con reservas" y no nombraba rubros. Ahora sí se nombran: el mensaje, los ejemplos y las imágenes hablan de cortes, color, barba y manicura, y desde la landing nueva también de la consulta dental, el cuarto oficio (sección 9).

**Vocabulario por rubro:** en salones, barberías y spas de uñas se dice **"Clientes"** — nunca "pacientes" ni "usuarios" — y quien atiende es **"profesional"**. La clínica dental habla como una clínica: **"Pacientes"** (en vez de Clientes), **"Sala de espera"** (en vez de Tablero), **"Odontólogo"** (en vez de Profesional) y **"Motivo"** (en vez de Servicio, en la reserva). Las palabras salen de un solo lugar, `lib/vocabulario.ts` (`vocabularioDe`), con el rubro de la sesión; cualquier rubro que no sea el dental habla como hoy.

Los negocios que ya existen con otros rubros (`salud`, `fitness`, `otro`) siguen funcionando y se ven como los tres primeros: para ellos el rubro es un dato de segmentación. Sólo la clínica dental cambia la interfaz.

### Misión

Centralizar la información, eliminar el trabajo engorroso y construir soluciones donde hoy sólo hay problemas.

---

## 2. Diferenciador

Booksy, Fresha, Calendly y Agenda Pro compiten en **agendar**. Ninguna resuelve el **reparto**.

En salones, barberías y spas de uñas, quien atiende se lleva un porcentaje del servicio y el negocio retiene el resto. Hoy eso se hace con planilla, calculadora o memoria — y a fin de mes genera discusiones, errores y desconfianza.

**Eli lo resuelve dentro del mismo sistema donde ya vive la cita.** No hay que exportar nada ni recalcular a mano: al cobrar la atención, la comisión de cada línea queda calculada y congelada (sección 3.3). Si a esa línea le falta el %, queda pendiente, nunca en cero, y se congela al cerrar la liquidación (3.7).

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

En una clínica dental, **las prótesis no pasan por esta cascada**: tienen su propio reparto en tres partes (3.11). Es el segundo camino de comisión de Eli; no hay otro.

**El caso 3 nunca asume cero en silencio.** Una comisión sin configurar es un error de configuración, no una comisión de $0. Se muestra como pendiente y se le avisa al dueño; si no, se liquida de menos sin que nadie lo note.

**Por qué con herencia:** el dueño configura un porcentaje por persona y listo. Sólo define excepciones donde realmente las hay. No tiene que llenar una matriz de todos los profesionales por todos los servicios el primer día.

**Dónde se configura.** La dueña fija en **Comisiones** el % por defecto de cada profesional y sus excepciones por servicio. Vacío es "sin configurar" (no es 0 %): lo cobrado queda pendiente hasta que se configure, y cada profesional muestra cuántos servicios suyos esperan %. Lo cobrado antes de "Liquidar desde" (3.7) no cuenta como pendiente: nunca va a entrar a una liquidación. El % de los productos se ve ahí y se edita en Configuración › Productos. Cada cambio queda en el historial (quién, cuándo, de cuánto a cuánto), incluidos los de quienes ya dejaron el equipo; el historial se filtra por profesional, y también por quien ya se fue (por el nombre que tenía, así que dos ex-miembros que se llamaban igual salen juntos). El encargado y el profesional no ven esta sección.

### 3.2 Base de cálculo

Sobre el **precio de cada servicio cobrado**, sin descontar insumos. Es la línea de la atención (sección 7): servicio, profesional que lo hizo y precio. La cita es lo planeado; la atención es lo que realmente se hizo y se cobró, y una atención puede tener varios servicios hechos por distintas personas.

> ⚠️ **Riesgo asumido y documentado.** No contempla descontar materiales antes de repartir (relevante donde hay insumos caros, como tintura). Si aparece esa necesidad, agregarla implicará migrar datos ya cargados. Se acepta el riesgo para v1.

### 3.3 Congelado — la regla que no se negocia

**Al cobrar la atención, el porcentaje y el monto se guardan en cada línea.** No se recalculan nunca más.

Si el dueño le cambia el porcentaje a Juan hoy, **las atenciones de los meses anteriores conservan el porcentaje que tenían.** Sin esto, cada ajuste reescribe liquidaciones ya pagadas y las cuentas dejan de cerrar. Es el error clásico de los sistemas de comisiones y es carísimo de reparar una vez que hay datos.

Las prótesis congelan dos veces: la regla de reparto, al crear la prótesis; y el monto de cada parte, al cobrar cada abono (3.11).

### 3.4 Quién puede tocar qué

| | Configurar porcentajes | Ver liquidación de todos | Ver la propia |
|---|---|---|---|
| **Dueño** | ✅ | ✅ | — |
| **Encargado** | ❌ | ✅ | — |
| **Profesional** | ❌ | ❌ | ✅ |

El encargado gestiona la operación: equipo, agenda, horarios (también el horario general del negocio, el que publica la reserva: en Configuración lo ve como primera pestaña, "Horario general"). **No define cuánto cobra cada uno.** Sí registra cobros en el tablero: es la caja del día y así lo decidió el dueño. Ver más permisos se puede abrir después; cerrarlos después es incómodo.

- **Productos:** el catálogo lo gestionan dueña y encargado; el % de cada producto, sólo la dueña (si lo manda el encargado, se rechaza).
- **Propinas:** las registra quien cobra (dueña y encargado).
- **Liquidaciones:** el período y "Liquidar desde" los elige sólo la dueña; la vista previa, cerrar, marcar pagada y anular, también. Adelantos y vales: dueña y encargado; ajustes: sólo la dueña (3.8).
- El profesional ve el % y el monto sólo de sus propias líneas.
- **Prótesis** (clínica dental): el reparto de cada material, sus excepciones por profesional, los materiales y los laboratorios los configura sólo la dueña; "Por pagar al laboratorio", también. La odontóloga ve sólo su parte de las prótesis de las que es tratante (3.11).

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
MaterialDeProtesis (precio, unidad, pbOdontologo/pbClinica/pbTecnico)
ExcepcionDeRepartoDeProtesis (memberId, materialId, pb × 3)
                                            → regla de reparto de prótesis (3.11)
Protesis.pbOdontologo/pbClinica/pbTecnico   → congelado al crear la prótesis
VisitService.protesisId + odontologoCents/clinicaCents/tecnicoCents
                                            → abono: sin comisión de la cascada,
                                              reparto congelado al cobrar
CambioDeRepartoDeProtesis                   → auditoría del reparto
PagoAlLaboratorio                           → lo pagado al laboratorio
```

Las columnas de comisión de `citas` (`commissionPercent`, `commissionAmount`, `commissionAt`) quedan sin uso: la comisión vive en la línea de la atención.

### 3.7 Liquidaciones

Cada negocio liquida al equipo con un período que elige sólo la dueña: **semanal** (con el día en que empieza la semana), **quincenal** (1 al 15 y 16 a fin de mes) o **mensual** (por defecto). Cambiar el período sólo afecta lo que viene.

**Liquidar desde.** Antes de la primera liquidación la dueña elige "Liquidar desde" (por defecto hoy, en la zona del negocio). Lo cobrado antes de esa fecha, sus propinas y los adelantos, vales y ajustes con fecha anterior nunca entran a una liquidación ni cuentan como pendientes (ni de % en Comisiones y Mi plata, ni en la lista de adelantos, vales y ajustes pendientes); un adelanto, vale o ajuste nuevo no se puede registrar con fecha anterior. Así lo que ya se pagó por fuera de Eli no se paga dos veces. Mientras no esté fijada no se puede ver la vista previa ni cerrar. Se puede cambiar sólo mientras no haya liquidaciones no anuladas; un cambio no pasa a la vez que un cierre, una anulación de liquidación o el registro de un adelanto, vale o ajuste.

**Qué cubre.** La liquidación de cada profesional va desde el día siguiente a su última liquidación no anulada (la primera, desde el inicio del período de lo más antiguo que tiene pendiente, o del de hoy si no tiene nada, pero nunca antes de "Liquidar desde") hasta el fin del período que contiene ese día, en la zona del negocio. Incluye sus servicios y productos cobrados y todavía sin liquidar (lo atrasado se arrastra), sus propinas, sus adelantos y vales (descuentan) y los ajustes (con signo y motivo).

**Total = comisiones + propinas − adelantos y vales + ajustes.** En una clínica dental, las comisiones incluyen la parte de la odontóloga de los abonos de prótesis ya liberados (3.11), en una sección aparte del comprobante y del CSV.

La dueña ve una **vista previa** sin guardar. Lo que no tenía % al cobrar dice "se congelará al X %" y se congela al cerrar. No se cierra mientras haya líneas sin % configurado ni con el total negativo (los adelantos se pueden dejar para la siguiente). Cerrar pide confirmación, con el total a pagar, y cierra con ese total: si mientras se confirmaba se cobró, se anuló o se registró algo y el total ya es otro, no cierra ("cambió mientras confirmabas") y la vista previa se recalcula. Los ajustes no se dejan para la siguiente: sólo adelantos y vales. Si el período todavía no termina (hoy es su último día o antes), la confirmación lo dice ("El período termina el 30 nov 2026: lo que se cobre de aquí a esa fecha queda para la próxima liquidación. ¿Cerrar igual?"). Cerrar, **marcar pagada** (con medio, quién y cuándo) y **anular** son de la dueña. Se anula sólo una cerrada no pagada: libera lo que incluía, y lo ya congelado queda congelado. Una atención incluida en una liquidación no se anula ni se reactiva su cita: se corrige con un ajuste.

### 3.8 Adelantos, vales y ajustes

Adelantos y vales los registran dueña y encargado; los ajustes, sólo la dueña y con motivo. No se borran: se anulan, mientras no estén en una liquidación.

### 3.9 Comprobante

Cada liquidación tiene un comprobante en el panel que se imprime o se guarda como PDF desde el navegador y se descarga en CSV. Compartir manda un resumen y el enlace interno: no hay enlace público. El profesional ve sólo los suyos. El de una liquidación anulada lo dice: lo que incluía volvió a quedar pendiente, los montos de cuando se cerró se ven tachados y el total a pagar es $0. El CSV lo dice igual: estado "Anulada", quién la anuló y por qué, "Total al cerrarse (anulada)" y "Total a pagar" en 0.

### 3.10 Mi plata

Quien atiende (tiene un lugar en el equipo; la dueña no) ve lo que lleva ganado hoy, esta semana y en el período en curso: comisión ya calculada más propinas, por día de cobro en la zona del negocio. También cuántos servicios esperan porcentaje (sin monto), sus adelantos y vales por descontar y sus liquidaciones con comprobante. Nunca ve totales del negocio ni lo de otros.

En una clínica dental suma su parte de los abonos de prótesis ya liberados, por el día en que se liberaron (3.11), y muestra aparte lo cobrado de prótesis suyas todavía sin entregar ("por liberar"), que todavía no es suyo para liquidar.

### 3.11 Prótesis: el segundo camino (clínica dental)

Decidido el 2026-11-08. Una prótesis la hace un laboratorio externo y su valor se reparte en **tres partes: la odontóloga tratante, la clínica y el técnico** (el laboratorio). No pasa por la cascada de 3.1: es otro camino, sólo en una clínica dental y sólo para prótesis (sección 6, "Prótesis").

- **La regla.** Cada material tiene su reparto, en porcentajes del valor cobrado al paciente (sin descontar el costo de materiales, como en 3.2). Una **excepción por profesional y material** manda sobre la del material, como `CommissionRate` sobre el % por defecto. Las tres partes se guardan en **puntos base y suman exactamente 100 %** (10.000): si no suman, no se guarda.
- **Congelada al crear la prótesis.** Al crearla se copia la regla que aplica (la excepción de la tratante o la del material) y su valor. Cambiar después el reparto o el precio de un material sólo afecta las prótesis nuevas, y cada cambio de reparto (de un material o de una excepción) queda en un historial: quién, cuándo, de cuánto a cuánto. Ese historial todavía no tiene pantalla (sección 10).
- **Se cobra por abonos.** El paciente paga en la Sala de espera, como cualquier atención, y puede pagar **por partes**: cada abono es una línea de la atención ligada a la prótesis, de monto libre hasta el saldo (sección 7, "Abonos de prótesis"). El abono **no lleva la comisión de la cascada** (no tiene %, no cuenta como "sin %" ni como pendiente en Comisiones ni en Mi plata): así la odontóloga no cobra dos veces. **Al cobrarse, cada abono congela su reparto** con la regla de la prótesis, exacto al centavo: la parte de la odontóloga y la del técnico se redondean como cualquier comisión y la clínica se queda con el resto, así las tres suman el abono.
- **Se libera al entregar.** La parte de la odontóloga de un abono se libera **el día más tardío entre su cobro y la entrega de la prótesis**, y entra en la liquidación del período que contiene ese día (o en la siguiente, si se atrasó). Lo cobrado antes de entregar entra en la liquidación del período de la entrega; lo cobrado después, en la del período de su cobro. Lo cobrado antes de "Liquidar desde" nunca entra (3.7). La parte del técnico se libera con la misma regla y pasa a "Por pagar al laboratorio" (sección 6). La parte de la clínica no se liquida a nadie.
- **Si la tratante es la dueña** trabajando como dueña (sin membresía), su parte va a la clínica: no se paga a sí misma. Si atiende como odontóloga de su clínica (sección 5, "Una cuenta en varios negocios"), es una tratante más.
- **Quién.** Materiales, reparto, excepciones y laboratorios los configura **sólo la dueña**, en Comisiones › Reparto de prótesis y en Configuración › Laboratorios; el encargado no ve nada de esto. En la ficha el reparto se ve sin editar: la dueña ve las tres partes y de dónde salió la regla; **la odontóloga tratante ve sólo su parte** (ni la de la clínica ni la del laboratorio); otro odontólogo y el encargado, ninguna. El valor al paciente lo ve quien ve la prótesis.

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

**En una clínica dental** (decisión del dueño): el dueño y los odontólogos (el rol profesional) **ven y escriben la ficha clínica de todos los pacientes** — antecedentes, odontograma, evoluciones y plan de tratamiento —, no sólo la de los suyos. El encargado (la recepción) **sólo ve la alerta de alergias** (en la cita, en la ficha y en Pacientes) y **el plan de tratamiento, sin editarlo**; no ve el odontograma, los antecedentes ni las evoluciones. Crear, ordenar y desactivar sillones es de dueño y encargado; asignarle un sillón a una cita, de todo el equipo de la clínica (el odontólogo, sólo a sus citas). En el inicio, el odontólogo ve sólo lo suyo y los presupuestos sin montos (sección 6, "Clínica dental"). **Prótesis:** el dueño y los odontólogos ven, crean y avanzan las de todos los pacientes; del reparto, el dueño ve las tres partes y la odontóloga sólo su parte de las prótesis de las que es tratante (sección 3.11). El encargado **no ve la pestaña Prótesis**, pero **cobra los abonos en la Sala de espera** como cualquier cobro: ahí ve, de cada prótesis del paciente, el valor, lo pagado y el saldo, sin el reparto. Materiales, reparto, laboratorios y "Por pagar al laboratorio" son sólo del dueño. Lo decide `lib/permisos.ts` (`veFichaClinica`, `veAlertaDeAlergias`, `vePlanDeTratamiento`, `puedeGestionarSillones`, `veProtesis`, `veMontosDelReparto`, `puedeCobrarAbonosDeProtesis`…), que falla cerrado: en un negocio que no es dental, nadie ve nada de esto, ni el dueño.

### Cuentas (decidido)

- **Una cuenta entra de una sola forma.** La que se creó con Google entra con Google; la que se creó con correo y contraseña (registro o invitación al equipo) entra con correo y contraseña. Si alguien intenta entrar con Google usando el correo de una cuenta con contraseña, Eli **no las vincula**: lo manda a iniciar sesión con el mensaje "Esta cuenta usa correo y contraseña. Entra con ellos.". Vincularlas sola le daría la cuenta a quien controle ese Gmail sin conocer la contraseña. Google además tiene que dar el correo como verificado.
- **El correo de una cuenta no distingue mayúsculas ni espacios en las puntas**: se guarda y se busca en minúsculas.
- **Iniciar sesión tiene tope:** 10 intentos por minuto desde una misma conexión y 10 por minuto para una misma cuenta. Pasado, la pantalla dice "Demasiados intentos. Espera un minuto y vuelve a intentarlo.". Responder "correo o contraseña incorrectos" tarda lo mismo exista o no la cuenta, y pedir el enlace de recuperar la contraseña responde lo mismo y en el mismo tiempo (el correo sale después); a un mismo correo le llegan como mucho 3 enlaces por hora.
- **Las sesiones duran 7 días** y se revisan contra la base cada 5 minutos: a quien sacan del equipo o le cambian el rol, el cambio le llega en ese plazo. **Restablecer la contraseña cierra todas las sesiones abiertas** de esa cuenta.
- **Los enlaces de recuperar contraseña e invitación son de un solo uso** y la base guarda sólo su huella (hash), no el enlace.
- **Una invitación se acepta con una cuenta nueva o con una que ya existe.** Si el correo invitado ya tiene cuenta en Eli, quien acepta tiene que haber iniciado sesión con esa cuenta (la pantalla de la invitación ofrece "Inicia sesión" y vuelve a la invitación al entrar); entonces aceptar no pide contraseña: sólo suma ese negocio a la cuenta y entra a él. Lo único que se rechaza es invitar o aceptar a quien ya es miembro de ese negocio.
- **Las invitaciones al equipo vencen a los 7 días.** En Equipo, cada invitación pendiente dice "Vence el …" o "Vencida", y dueño y encargado pueden **reenviarla** (enlace nuevo y 7 días más; el enlace anterior deja de servir) o **anularla**, con confirmación. Invitar de nuevo un correo con una invitación vencida la reemplaza; si está vigente, se ofrece reenviarla. Reenviar a un mismo correo tiene tope: 3 por hora.

### Una cuenta en varios negocios (decidido el 2026-11-10)

- **Contextos.** Una cuenta puede ser dueña de un negocio y, además, estar en el equipo de otros (encargada o profesional), o ser profesional en varios. **La dueña también puede invitarse como profesional (o encargada) de su propio negocio**, si además de administrarlo atiende. Cada combinación de negocio y rol es un *contexto*: el de dueña de su negocio y uno por cada membresía, también la que tiene en su propio negocio (`lib/contextos.ts`).
- **Se trabaja con uno a la vez.** Al iniciar sesión, si la cuenta tiene un solo contexto entra directo; si tiene más, elige con cuál en "¿Con qué negocio vas a trabajar?" (`/elegir-negocio`), que muestra el nombre de cada negocio, su rubro y el rol en palabras. Desde el panel se cambia con el botón de las flechas junto al nombre, en la barra lateral, que además dice el rol con que se está trabajando ("Profesional · Salón Uno"). Quien sólo es miembro de otros negocios puede crear el suyo desde esa misma pantalla ("Crear mi propio negocio").
- **Como profesional, es profesional a todos los efectos**, también en su propio negocio: ve sólo lo suyo (su agenda, sus atenciones, Mi plata), no ve lo de la dueña (plata del negocio, comisiones, plan), y sus líneas van a su nombre de profesional y **llevan comisión y se liquidan como las de cualquiera del equipo**. Como dueña, no: sus líneas son "de la dueña" y no generan comisión (sección 7).
- **Lo decide el servidor, nunca el navegador.** La sesión guarda sólo qué contexto se eligió; el negocio, el rol y la membresía salen de la base. Cambiar de contexto manda sólo su id, y el servidor lo busca entre los de la cuenta: uno ajeno o inventado se rechaza y la sesión sigue como estaba. En cada revalidación (cada 5 minutos, y en el acto al cambiar) se vuelve a comprobar que el contexto existe: si sacaron a la persona de ese equipo o dejó de ser dueña, la sesión se queda sin negocio (falla cerrado) y vuelve a elegir; con un solo contexto que le quede, entra a ése.
- **Aislamiento.** En cada contexto todo se lee con el negocio y la membresía de ese contexto, juntos: nunca se mezcla el negocio de uno con la membresía de otro.

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
- **Clínica dental:** ficha clínica con odontograma y evoluciones, alerta de alergias, plan de tratamiento con presupuesto, sillones, la reserva pública con motivo, primera vez y urgencia, y prótesis con laboratorios, cobro por abonos y reparto en tres partes (abajo, "Clínica dental")

**No entra:**
- Cobro online al cliente final
- Mensajes automáticos por WhatsApp, topes de mensajes por plan y packs (sección 10)
- Reportes exportables (sí se descargan en CSV los clientes y las atenciones de un rango, ver Clientes, y el comprobante de cada liquidación)
- Inventario de productos
- Retención de honorarios en la liquidación (decisión del dueño, sección 10)
- Aplicación móvil nativa
- Multi-sucursal
- En la clínica dental: página propia (`/odontologia`), documentos, radiografías y consentimientos (falta el almacenamiento, sección 10), PDF del plan, abonos y pagos del plan (las prótesis sí se abonan), cambios en la caja o en la comisión de las prestaciones (las prótesis tienen su propio reparto, sección 3.11), costo de materiales de las prótesis, correo al laboratorio y liquidación propia del laboratorio, periodontograma, implantes y puentes como marca del odontograma, bloqueos por sillón e historial de versiones del odontograma

**Zona horaria del negocio.** Cada negocio tiene su zona horaria (IANA, por defecto `America/Santiago`). En ella se leen sus horarios de atención y sus días: qué día de la semana es una fecha, qué horas ofrece la página pública (y cuáles ya pasaron hoy), en qué instante se guarda la cita reservada y qué citas trae la vista Día, Semana y Mes de la agenda. La agenda también muestra y escribe sus horas en esa zona, no en la del dispositivo de quien mira: en qué día y a qué hora se dibuja cada cita y cada bloqueo, cuál es "hoy", y en qué instante se guarda una cita creada o movida y un bloqueo nuevo. Si la zona guardada no es válida, se usa la de por defecto. Con el cambio de horario, una hora que no existe se corre hacia adelante lo que dura el salto y una que ocurre dos veces se toma la primera vez. **Todavía no hay pantalla para cambiarla** (sección 10).

**Crear y mover una cita.** Desde el detalle de la cita, "Cambiar fecha y hora": fecha, hora de inicio, hora de fin y, para dueño y encargado, el profesional. El selector de profesional (al crear, mover o asignar) ofrece sólo a quienes atienden, como la reserva pública: el encargado no aparece; si la cita ya estaba con alguien que no atiende, se muestra igual para que se vea con quién está. El servidor aplica la misma regla: crear o reasignar una cita a alguien que no atiende se rechaza con un mensaje claro; una cita que ya estaba con esa persona se sigue editando mientras no se le cambie el profesional. El profesional mueve sólo sus citas y no las reasigna. Al crear o al mover, si el horario choca con otra cita del mismo profesional (las canceladas y las de "No vino" no cuentan), cae en un bloqueo del profesional o de todo el negocio, o queda fuera de su horario de atención —el suyo si cargó uno propio, si no el del negocio—, Eli avisa ("Carla ya tiene una cita de 10:00 a 11:00", "Carla tiene bloqueado de 13:00 a 14:00 (Almuerzo)") y pregunta si se guarda igual: en el panel avisa, no bloquea. Si el negocio no cargó ningún horario, no avisa por horario. No se mueven las citas canceladas, completadas ni de "No vino", ni las que ya tienen una atención en el Tablero (salvo que esté anulada). Para avisar "fuera de horario" sólo cuentan el horario general y el de quienes atienden: el horario propio de un encargado no hace que el negocio atienda un día sin horario general (lo mismo para las horas que dibuja la agenda y para la fila virtual).

**Nueva cita con servicios del catálogo.** En "Nueva cita" se eligen hasta 4 servicios del catálogo (el mismo selector de la reserva pública), o se escribe uno a mano para una cita sin servicio del catálogo. Elegirlos llena la hora de fin y el precio, y la cita queda como una de la reserva pública: con sus nombres unidos de título, el primer servicio y una fila por servicio, así que al llegar al Tablero se precargan. El selector muestra sólo lo que hace el profesional elegido; si se cambia a uno que no hace alguno, se quita. El servidor lee los servicios del catálogo del negocio (no lo que manda el navegador) y rechaza dejar la cita, al crearla o al reasignarla, con un profesional que tiene acotado lo que hace y no los hace todos. Un precio escrito a mano manda sobre la suma de los servicios. Al editar la duración de una cita con servicios (al crearla o al moverla), lo que dura cada servicio se reparte en proporción para que sumen lo nuevo; los precios no cambian. Su título sale de los servicios: cambiarlo a mano responde que no se puede (mandar el mismo sí).

**Citas sin profesional.** Si el negocio tiene profesionales, la agenda de dueña y encargado destaca las citas que todavía se pueden cambiar y no tienen profesional (las reservas públicas de antes llegaron así y ocupan la hora de todo el equipo): un borde punteado en la Semana y "Sin profesional" en el Día y en el detalle. Desde el detalle, "Asignar profesional" elige a quién va sin tocar su horario; si esa persona ya tiene algo a esa hora, un bloqueo o queda fuera de su horario, se avisa y se puede asignar igual, como al mover. El profesional no ve las citas sin asignar. En un negocio sin profesionales no se destaca nada.

**Bloqueos de horario.** "Bloquear horario" en la agenda cierra un tramo (almuerzo, trámite, feriado), con fecha y hora de inicio y de fin y un motivo opcional. Dueño y encargado bloquean a cualquier profesional o a todo el negocio; el profesional, sólo su propia agenda. En las vistas Día y Semana se ven como franjas grises; tocarlas muestra el detalle y, a quien puede, "Quitar bloqueo". El profesional ve los suyos y los de todo el negocio. Una cita encima de un bloqueo pide confirmación (arriba). La página pública no ofrece horas sobre un bloqueo (abajo).

**"No vino".** Una reserva pendiente o confirmada cuya hora ya pasó se marca "No vino": desde el detalle de la cita en la agenda o, si está atrasada, desde su tarjeta en "Reservas de hoy" del Tablero. No se puede si el cliente ya está en el Tablero (hay que deshacer la llegada) ni antes de la hora (si avisó, se cancela). Libera el horario como una cancelada, no se mueve, no recibe recordatorio y suma en la ficha del cliente (abajo). Si el cliente llega al Tablero mientras se marca, gana la llegada (409). Se deshace desde el detalle de la cita con "Deshacer «No vino»" (dueña y encargado), que la devuelve a confirmada con las reglas de reactivar (abajo).

**Quién canceló.** Cada cita cancelada guarda quién la canceló y cuándo: el cliente, si fue desde su enlace; el negocio, si fue desde el panel o al anular en el Tablero la atención de una reserva sin cobrar. Volver a marcar "cancelada" una que ya lo estaba no cambia ni quién ni cuándo. El detalle de la cita en la agenda lo muestra, en la hora del negocio (las canceladas antes de que se guardara ese dato no lo muestran), y al reactivarla se borra.

**Reactivar una cita.** Dueña y encargado pueden reactivar una cita cancelada (si todavía no empieza; se avisa si choca y se puede confirmar igual) o devolver a confirmada una completada o de "No vino", si no tiene una atención viva en el Tablero. La de "No vino" había liberado su horario: al volver también se avisa si choca y se puede confirmar igual. Si esa atención ya entró en un cierre de caja o en una liquidación, no se reactiva: se corrige con un ajuste, y el detalle de la cita lo dice ("Se corrige con un ajuste") y deja de ofrecer reactivarla. El profesional no saca una cita de cancelada, completada o "No vino". Una completada ya no se cancela directo. Si otro cambia la cita mientras se reactiva, no se pisa su cambio.

**Cancelar una cita con el cliente en el local.** Una cita cuyo cliente ya llegó (tiene una atención no anulada en el Tablero) no se cancela desde la agenda: el detalle no ofrece "Cancelar cita" y, si se intenta igual, Eli responde "Esta cita ya tiene una atención en el Tablero: anúlala ahí primero". Al anular esa atención la cita queda cancelada sola (sección 7). Si el cliente llega justo mientras alguien la cancela, gana la llegada. Lo mismo al devolver a pendiente o confirmada una cita "en progreso" cuyo cliente sigue en el Tablero: responde lo mismo, y primero se deshace la llegada o se anula la atención.

**Recordatorios.** Un correo al cliente con email, una vez por cita, el día anterior en la zona del negocio, con la fecha y la hora de allá. No sale para las canceladas, las completadas ni las de "No vino". Lo manda un cron diario a las 13:00 UTC (~10:00 en Chile): el plan Hobby de Vercel no permite más de uno al día. Una cita creada después de esa hora para el día siguiente no recibe recordatorio. Por eso la pantalla de reserva confirmada dice "También te llega un recordatorio por correo el día antes" sólo si se dejó correo y el cron alcanza a mandarlo (lo calcula el servidor al confirmar, con su hora y la misma regla del cron); si se reservó para hoy, o para mañana después de la corrida, no lo promete. El correo de confirmación no menciona el recordatorio. Las reservas públicas hechas antes de que existiera el enlace para cancelar o reagendar reciben ese enlace en el recordatorio si todavía se pueden cambiar (se crea al enviarlo; las que ya lo tienen lo traen en su correo de confirmación, y las citas del panel no tienen enlace). Si el envío falla y el correo pudo haber llegado, el enlace creado sigue sirviendo y el recordatorio no se reintenta (más vale uno perdido que dos); sólo si el proveedor rechazó el envío (o no se llegó a intentar) se descarta el enlace y una corrida manual del mismo día lo reintenta. Una cita que se mueve a otra hora (desde el panel o por el enlace) vuelve a recibir su recordatorio para la hora nueva. El cron lee las citas por páginas y, si no alcanza a revisarlas todas, lo dice (`incompleto`).

**Servicios de ejemplo.** Un negocio nuevo (registro con correo o con Google) nace con 5 o 6 servicios comunes de su rubro, con duración, precio de referencia en pesos y categoría (`lib/servicios-de-ejemplo.ts`): corte, brushing y color en un salón; corte, barba y corte infantil en una barbería; manicure, esmaltado permanente, acrílicas y pedicure en un spa de uñas; evaluación, limpieza y destartraje, restauración con resina, exodoncia simple, urgencia dental (marcada como urgencia) y endodoncia en una clínica dental. Se crean junto con el negocio (si uno falla, no se crea ninguno de los dos) y se editan o borran como cualquier otro. Un rubro que el catálogo no conoce nace sin servicios.

**Horas de la agenda.** Las vistas Día y Semana muestran como mínimo de 8 a 20, y se amplían para incluir el horario de atención del negocio y cualquier cita fuera de ese rango. La vista Día lista todas las citas de cada hora; en la Semana, las que se pisan se dibujan lado a lado.

**Cómo se escriben horas y duraciones.** El panel escribe las horas en 24 h (`00:00`, `14:30`), también en la caja, el historial de comisiones y el comprobante de la liquidación. La duración de una cita, en el detalle y en su tarjeta, va en horas y minutos (`45 min`, `2 h`, `4 h 15 min`). Los campos para elegir una hora (horario, hora valle, nueva cita, mover y bloquear) son dos listas, horas de 00 a 23 y minutos de 5 en 5, así que nunca aparecen a. m./p. m. Un minuto guardado fuera de ese paso (09:07) se sigue viendo y no cambia solo.

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
  - **Pendiente:** los chats (`Conversation` y sus mensajes, hoy apagados) guardan nombre y teléfono sin enlace a la ficha del cliente, así que eliminarlo no los toca; hay que atarlos al cliente antes de volver a encenderlos. Y los correos que ya se le enviaron (recordatorios, confirmaciones) quedan en el historial del proveedor de correo (Resend), fuera de la base de Eli. En una clínica dental, la ficha clínica del paciente (antecedentes, odontograma, evoluciones y plan) todavía no se toca al eliminarlo (sección 10, "Clínica dental: conservar la ficha").

- **Nombre:** un cliente nuevo de la reserva pública queda con nombre y apellido juntos, como los que se crean en el panel, y el buscador de Clientes lo encuentra por cualquiera de los dos. Los creados antes por la reserva pública guardaban el apellido aparte: en todo el panel (Clientes y su ficha, buscadores, agenda, inicio y Tablero) se muestran nombre y apellido juntos, y al editar el nombre en la ficha queda guardado entero. El buscador busca el nombre palabra por palabra ("Lucía Pérez", "pérez lucía") en el nombre y en el apellido; correo y teléfono, con el texto entero. Un cliente que ya existía y se reutiliza (mismo correo y nombre) no cambia su nombre.
- **Teléfono:** se guarda en formato internacional (`+56912345678`) y se muestra con espacios (`+56 9 1234 5678`). Se acepta escrito de cualquier forma común ("9 1234 5678", "56912345678", un fijo "2 2345 6789"); uno que no se puede leer como número chileno es un error que dice cómo escribirlo. Los teléfonos guardados antes de este cambio no se reescribieron: se muestran igual de ordenados si se pueden leer, y `scripts/normalizar-telefonos.ts` (lo corre el dueño; README.md) los pasa a `+56` con la misma regla; los que no se pueden leer como chilenos quedan como estaban. Así se muestran también en la agenda (lista de espera) y en el buscador de clientes del Tablero.
- **Consentimiento de WhatsApp:** "Acepta recibir mensajes por WhatsApp" en el formulario del cliente (dueño y encargado). Marcarlo guarda cuándo y que fue desde el panel; desmarcarlo lo borra. Sin marcar, el cliente no tiene consentimiento.
- **Consentimiento de novedades por correo:** "Quiere recibir avisos y novedades de <negocio> por correo" en la ficha (dueño y encargado), y "Quiero recibir…" en la reserva pública. Marcarlo guarda cuándo y desde dónde; desmarcarlo en la ficha es darlo de baja. Sin él no le llegan "Te toca volver" ni el pedido de reseña (abajo, "Mensajes a clientes").
- **Importar CSV** (Clientes → Importar CSV, dueño y encargado): un archivo de hasta 2 MB y 5.000 filas, separado por coma, punto y coma o tabulación, en UTF-8 o en el formato de Excel. Muestra las primeras filas y sugiere qué columna es cada dato por su título (Nombre, Apellido, Teléfono/Celular, Correo/Email, Notas, Acepta WhatsApp); nombre y apellido se juntan. **No crea repetidos:** una fila con el teléfono o el correo de un cliente que ya está en el negocio, o de una fila anterior del archivo, se omite. Tampoco si dos personas del negocio importan al mismo tiempo: las importaciones del negocio se hacen de a una. Cada importación se guarda entera o no se guarda: si falla, no queda ningún cliente a medias y todas las filas dicen "No se pudo guardar. Vuelve a importar el archivo." (volver a importarlo no repite nada). Al final dice cuántos se crearon, cuántos se omitieron por repetidos y cuáles tuvieron errores, con el número de fila y el motivo. Los importados no tienen consentimiento de WhatsApp salvo que el archivo traiga esa columna y diga que sí. Hasta 5 importaciones por hora por negocio.
- **Exportar** (dueño y encargado): los clientes del negocio, o las atenciones que llegaron entre dos días (hasta un año), en un CSV que abre Excel en español. Los clientes eliminados y sus atenciones no salen. Una celda que empieza con `=`, `+`, `-` o `@` lleva una comilla adelante para que la planilla no la ejecute como fórmula; al reimportar el archivo se quita. Hasta 20 descargas por hora por negocio.

### Página pública del negocio

`/reservar/<slug>` muestra primero al negocio y debajo el flujo de reserva (`#reservar`):

- **Cabecera:** el color elegido (o su portada), el logo o sus iniciales, nombre, comuna y "Abierto ahora · cierra a las 20:00" / "Cerrado · abre mañana a las 10:00", calculado con el horario de atención en la zona del negocio. Quien atiende de noche carga dos franjas (hasta las 23:59 y desde las 00:00) y se leen como una. Sin horario no se muestra estado.
- **Botones:** Reservar, WhatsApp, Instagram y Cómo llegar (Google Maps o Waze, con dirección y comuna). Cada uno aparece sólo si hay dato; Cómo llegar pide dirección.
- **Equipo:** los profesionales (el encargado no, porque no cuenta como persona que atiende), con foto o iniciales, especialidad y "Reservar con <nombre>", que abre la reserva con ese profesional elegido.
- **Servicios** agrupados por categoría (los sin categoría van a "Otros"), con duración y precio; **horario** de lunes a domingo; **ubicación**; **medios de pago** del catálogo de cobro.
- **Horario publicado:** exactamente el que la reserva ofrece. Con profesionales que atienden, la unión del horario efectivo de cada uno (el propio si lo cargó; si no, el del negocio), y el del negocio no se suma aparte: un negocio de lunes a viernes de 09:00 a 18:00 y sábado de 10:00 a 14:00 cuya única profesional, Carla, atiende lunes, martes y miércoles de 14:00 a 20:00 publica sólo lunes a miércoles de 14:00 a 20:00. Sin profesionales, el del negocio. Si hay profesionales pero ninguno hace un servicio activo, no se publica ninguna hora (la reserva tampoco ofrece). Es el mismo con que se calcula "Abierto ahora": así la página nunca promete una hora que la reserva no tiene, ni dice cerrada una que ofrece. El horario propio del encargado no se publica (no recibe reservas), ni el de un profesional que no hace ningún servicio activo. La fila virtual sigue abriendo con el horario del negocio (decidido, #163), y tampoco cuenta el horario propio del encargado.
- **Color:** una paleta cerrada de 7 tonos del sistema de diseño (Cielo, Durazno, Lavanda, Pistacho, Menta, Arena, Noche); la marca de Eli no cambia. Cada uno pasa contraste AA con su texto. Un valor desconocido usa Cielo.
- **Al compartir el enlace:** título con nombre y comuna, descripción y una imagen generada (nombre, comuna, iniciales en el color del negocio).
- **Se edita** en Configuración → "Tu página pública": dirección, comuna, WhatsApp, Instagram (usuario o enlace del perfil), color con vista previa, medios de pago y especialidad de cada profesional. Dueño y encargado; el profesional la ve sin poder cambiarla. La categoría de cada servicio se pone en Servicios.
- **Fotos: próximamente.** Logo, portada y fotos de profesionales se muestran si existen y son del mismo sitio, pero no hay forma de subirlas ni se pueden pegar URLs (sección 10).

### Reserva por profesional

- **Quién atiende:** los profesionales (rol `worker`) que hacen el servicio. Cada uno hace todos los servicios hasta que dueño o encargado lo acotan en Equipo → "Servicios que hace" (casillas o "Todos los servicios"). El encargado y el dueño no se ofrecen (sección 10).
- **Elegir:** después del servicio, "¿Con quién?": "Cualquiera disponible" o una persona. Con una, se ven sólo sus horas libres; con cualquiera, toda hora en que al menos uno está libre, y al confirmar la cita va al libre con menos citas ese día (si empatan, siempre el mismo). Si en el instante de confirmar nadie quedó libre, "El horario ya no está disponible". `?profesional=<id>` en el enlace (el "Reservar con <nombre>" de la página) lo deja elegido y muestra sólo sus servicios; un id que no es de un profesional del negocio se ignora. El calendario sólo deja elegir los días de la semana en que atiende alguien que puede tomar la reserva: el elegido, o con "cualquiera" alguno de los que hacen todos los servicios elegidos, cada uno con su horario efectivo (el propio, o si no el del negocio). Así no se elige un día que después responde "No hay atención ese día". Si después de elegir el día se cambia de profesional o de servicios y ese día deja de tener atención, se limpian el día y la hora y se avisa: "El día que habías elegido no tiene atención para esta reserva. Elige otro."
- **Qué ocupa a un profesional:** sus citas pendientes o confirmadas (las canceladas y las de "No vino" no), sus bloqueos y los de todo el negocio, y las citas **sin profesional asignado**, que ocupan a todos: así las reservas de antes de esto (que llegaron sin profesional) siguen bloqueando su hora. Su horario es el propio si cargó uno; si no, el del negocio. Un día en que el negocio no tiene horario general vale el de quienes atienden; el de un encargado nunca abre un día en la reserva ni en la página.
- **Negocio sin profesionales** (el dueño solo, o con un encargado): funciona como siempre, un solo carril con el horario del negocio, ocupado por cualquier cita activa y por los bloqueos de todo el negocio. La cita llega sin profesional asignado.
- **Aviso de nueva reserva:** le llega al dueño y, si la cita quedó a nombre de un profesional (elegido o asignado por "cualquiera"), también a ese profesional, al correo con que entra a Eli. Si es la misma casilla, llega una sola vez.
- **Cada cuánto se ofrecen horas:** desde que abre cada franja, cada 30 minutos (o cada lo que dure el servicio, si dura menos de 30), siempre que el bloque entero quepa libre antes del cierre. Un servicio de 90 minutos ya no salta de hora y media en hora y media: ofrece 09:00, 09:30, 10:00… El enlace para reagendar ofrece las mismas.
- La página nunca ofrece una hora que después rechazaría: ofrecer y confirmar usan la misma regla.

### Varios servicios por reserva

- En la reserva pública se pueden elegir **hasta 4 servicios** (por ejemplo, corte + color). Los hace **una sola persona, seguidos**, en un bloque continuo: la cita dura la suma de las duraciones y cuesta la suma de los precios. Se marcan tocando cada tarjeta; con más de uno, cada tarjeta lleva su número de orden y se ve el total (duración y precio). Si alguno no tiene precio publicado, se suma lo que hay y se dice "+ a consultar".
- **Quién atiende:** sólo los profesionales que hacen **todos** los servicios elegidos. Si el elegido no hace uno que se suma, vuelve a "Cualquiera disponible".
- Las horas ofrecidas son las del bloque entero, con las mismas reglas de siempre; la duración y el precio los calcula Eli con el catálogo del negocio, nunca con lo que manda el navegador.
- La cita se ve en la agenda con los nombres unidos ("Corte + Color") y el precio total. Los correos y el recordatorio dicen todos los servicios. El enlace para cancelar o reagendar mueve el bloque entero (si en el panel se alargó la cita, con lo que dura hoy, no con la suma: reagendar nunca acorta una cita, tenga o no el detalle por servicio); si alguno de los servicios se desactivó o se borró, sólo se puede cancelar.
- **Al llegar** (Tablero), la atención nace con una línea por servicio, cada una con el precio con que se reservó. Si alguno ya no está en el catálogo o no tiene precio, no se precarga ninguna (una parte cobraría de menos) y el editor se abre con la reserva. Lo mismo si en el panel se le cambió el precio a la cita (ya no es la suma de los servicios, con 1 peso de tolerancia): las líneas cobrarían el precio viejo y Eli no inventa cuánto vale cada servicio, así que el editor se abre con la reserva, que muestra el precio nuevo.
- La lista de espera sigue siendo de un servicio: con varios elegidos, se anota el primero. Pero al anotarse el día se revisa con todos y con la duración del bloque entero, igual que las horas que muestra la página (#162). El aviso sí se calcula sólo con el primero: puede llegar por una hora donde cabe ese servicio y no el bloque completo.
- Desde el panel, "Nueva cita" también elige hasta 4 servicios del catálogo (sección 6, "Nueva cita con servicios del catálogo").

### Precios de hora valle

- **Qué es:** una opción del negocio para llenar las horas tranquilas: un **% de rebaja** por día de la semana y franja horaria (por ejemplo, martes de 10:00 a 12:00, 15% menos), para todo el negocio. **Viene apagada**; apagada, nada cambia.
- **Configurar:** Configuración → "Precios de hora valle". Sólo la dueña (el encargado y el profesional no la ven; el servidor les responde 401). Enciende o apaga la opción, arma las franjas (de 5% a 90%, hasta 21, sin que se pisen dos del mismo día) y marca los **servicios sin rebaja**, que cuestan lo mismo a cualquier hora.
- **Cuándo aplica:** si la cita **empieza** dentro de la franja, en el reloj del negocio (la hora de inicio cuenta; no importa a qué hora termine). Si dos franjas aplican, manda la de mayor %. Con varios servicios, se rebaja cada uno que no esté excluido ni sin precio.
- **Redondeo:** cada servicio rebajado se redondea al peso (la mitad hacia arriba) y el total es la suma de esos precios, así la cita y sus servicios suman lo mismo.
- **En la página de reservas:** las horas valle muestran su precio y el % ("$6.400 −20%"); si el % rebaja sólo parte de la reserva (un servicio está excluido), muestran el monto ahorrado ("$31.400 −$1.600") y el resumen dice "Hora valle: $1.600 menos (20% en parte de los servicios)"; el resumen muestra el precio normal tachado y el rebajado. La mini página dice "Precios más bajos en horas valle" (sin listar las franjas). El precio lo vuelve a calcular Eli al confirmar, nunca con lo que manda el navegador, y la cita guarda el precio ya rebajado. El correo de confirmación dice el precio y, si tuvo rebaja, también el normal ("$31.400 (hora valle; precio normal $33.000)"); el de reserva confirmada por el local dice el precio guardado.
- **Al reagendar por el enlace:** con la opción encendida, el precio nuevo es **siempre el del catálogo de hoy con el % de la hora nueva** (con las franjas de hoy). No se arrastra la rebaja con que se reservó: si esa rebaja ya no existe, la hora nueva paga lo que paga hoy. Si el precio nuevo es distinto del que tiene la cita, la pantalla lo muestra antes de confirmar el cambio. Con la opción apagada, la cita conserva su precio.
- **Un precio puesto a mano en el panel no lo toca nunca el enlace:** si el precio de la cita ya no es la suma de sus servicios (con 1 peso de tolerancia), reagendar lo deja como está y no avisa de cambio. Las citas de antes de varios servicios (sin el detalle por servicio) se recalculan sólo si su precio es hoy el de su servicio; si no lo es (se cambió en el panel o cambió el catálogo, y no hay cómo saber cuál), se deja como está.
- **Citas del panel:** no se rebajan solas, tampoco las de servicios del catálogo (llevan la suma del catálogo); el precio lo pone quien la anota.

### Cancelar o reagendar sin cuenta

- El correo de confirmación trae "Cancelar o cambiar mi cita" (y la pantalla de reserva confirmada, el mismo enlace, para quien no dejó correo). Abre una página con la cita: negocio, servicio, profesional, día y hora en la zona del negocio, y el precio guardado (el de hora valle si lo tuvo, y el nuevo después de reagendar).
- **Cancelar** la deja cancelada por el cliente, con la hora, y libera el horario. **Reagendar** ofrece otras horas libres del mismo servicio y profesional, con las reglas de la reserva; su calendario, como el de la reserva, no deja elegir los días en que nadie que pueda tomarla atiende (los cerrados del negocio, o los que su profesional no tiene en su horario). En los dos casos se avisa por correo a la dueña y, si la cita tiene profesional, también a él (un correo aparte; una sola vez si es la misma casilla). Si al reagendar una cita sin profesional queda con uno, el aviso le llega a ese.
- **Plazo:** hasta 24 horas antes por defecto; dueño y encargado lo cambian en Configuración → "Plazo para cancelar o reagendar (horas)", de 0 a 72. Pasado el plazo la página muestra la cita y dice que hay que contactar al local.
- **El plazo se dice antes de reservar:** la cabecera de la página pública y el resumen del paso de confirmar muestran "Puedes cancelar o cambiar hasta 24 horas antes." (con el plazo del negocio; con 0 horas, "hasta el momento de la cita"). Es el mismo plazo que después aplica el enlace. Si la hora elegida ya está dentro del plazo (se reserva con menos anticipación que él), el resumen lo dice en su lugar: "Tu hora es en menos de 24 horas: una vez confirmada, no podrás cancelarla ni cambiarla por el enlace. Si lo necesitas, tendrás que contactar al local." Y después de confirmar, ni la pantalla de reserva confirmada ni el correo de confirmación ofrecen el enlace para cancelar o cambiar: dicen que, como la hora es en menos del plazo, hay que contactar directamente al local. El recordatorio del día anterior sigue la misma regla: si la cita ya está dentro del plazo (con el de 24 horas, casi siempre), no trae el botón y dice que se contacte al local.
- Un enlace inválido, de una cita cancelada, pasada o ya atendida dice "Este enlace no sirve", sin más detalle. También si el cliente ya llegó (su atención está en el Tablero): gana la llegada y el enlace ya no cancela ni mueve la cita, ni siquiera si llega mientras la está cambiando. La base guarda sólo una huella del enlace (no el enlace), y cada enlace tiene su propio límite de uso además del de la IP.

### Reservas por confirmar tras faltas

- **Qué es:** si quien reserva por la página pública faltó ("No vino") N veces o más en el último año (365 días) en ese negocio, la reserva entra **por confirmar**: ocupa la hora como cualquier otra, pero el local decide si la acepta. Las faltas se buscan **sólo por el correo** de quien reserva (sin mayúsculas ni espacios en las puntas), sólo entre las citas de ese negocio y de clientes no eliminados. No por el teléfono: el correo de confirmación llega a la casilla que se escribió, así que con el teléfono de otra persona y un correo propio se podía averiguar si ese teléfono faltó. Una reserva sin correo nunca entra por confirmar.
- **Configurar:** Configuración → "Reservas por confirmar". Sólo la dueña: lo enciende o lo apaga y elige N, de 1 a 20 (al encenderlo se propone 2). Viene apagado.
- **Quien reserva no ve nada distinto:** la pantalla y la respuesta de la reserva son idénticas con o sin faltas, para no revelarle a quien escribió un correo o un teléfono si ese contacto faltó. Como las faltas se cuentan por el correo, el correo que dice "el local la confirmará" sólo le llega a la casilla de quien faltó. Sólo su correo cambia: "Recibimos tu reserva; el local la confirmará y te avisaremos por correo". El aviso al negocio dice que es una reserva por confirmar.
- **Resolver:** en la agenda se ve como "Por confirmar" (también en el inicio y en el historial del cliente). La dueña y el encargado la **confirman** (pasa a confirmada y al cliente le llega un correo) o la **cancelan**. El profesional la ve, pero no le puede cambiar el estado ni borrarla (el servidor responde 401); sí puede moverla o escribirle notas. La marca queda en la cita como registro de por qué se pidió. Si dos personas la confirman a la vez, el cliente recibe un solo correo; si quien llegó segundo además cambiaba el horario, el profesional, las notas o el precio, recibe "la cita cambió" y no se guarda nada suyo.
- **Si llega al local:** registrar la llegada en el Tablero de una reserva por confirmar la da por resuelta: el cliente está en el local, así que no hace falta confirmarla antes. Mientras tenga una atención no anulada, la agenda, el inicio y el historial del cliente dejan de mostrarla como "Por confirmar" (en la agenda, sin el botón de confirmar); si igual se confirma, queda confirmada sin mandarle el correo de confirmada, y no se cancela desde la agenda, como ninguna cita cuyo cliente ya llegó (ver "Cancelar una cita con el cliente en el local", más arriba). Si la atención se anula, vuelve a estar por confirmar como cualquier otra.
- **Sin cobro:** no se pide abono. Un abono para quien ya faltó espera a la pasarela de pago.

### Teléfono y WhatsApp en la reserva

- El teléfono, opcional, se valida y se guarda como en el panel (`+56912345678`); uno que no se puede leer como chileno es un error que dice cómo escribirlo.
- Con teléfono aparece "Quiero recibir recordatorios por WhatsApp", sin marcar. En un cliente nuevo, el teléfono se guarda en su ficha y, marcado, el consentimiento con su fecha y que vino de la reserva pública. Todavía no se mandan mensajes por WhatsApp (sección 10).
- **Un cliente que ya existía** (mismo correo y nombre) nunca recibe desde la reserva pública ni teléfono ni consentimiento, tenga o no uno guardado, y la reserva no borra el que tenga: quien conoce el correo y el nombre de otra persona podría dejar su propio número y recibir los recordatorios de sus citas. Si el número dado no es el de la ficha, o se marcó WhatsApp, queda como nota interna de la cita ("Teléfono dado al reservar…", "Pidió recordatorios por WhatsApp…"), y el local lo confirma con el cliente y lo carga a mano en la ficha.

### Horario

- Sin un horario guardado, la página pública no ofrece horas. Configuración muestra un ejemplo (lunes a viernes de 9 a 18), pero avisa que **todavía no está guardado** y destaca el botón para guardarlo. Cambiar de persona con cambios sin guardar pregunta antes de descartarlos.

### Mensajes a clientes

Todo sale por correo; WhatsApp todavía no (sección 10). Cada envío queda registrado sin datos personales (tipo, canal, si es de servicio o promocional) y ese registro es también el candado: una corrida repetida no manda dos veces lo mismo, y si el envío falla se reintenta. Los promocionales tienen un tope de 50 por negocio y día (en la zona del negocio), y cada corrida diaria, uno de 100 correos en total.

- **Interruptores.** En Configuración › Mensajes a clientes la dueña enciende o apaga cada uno: lista de espera (viene encendida), "Te toca volver" y "Pedir reseña en Google" (vienen apagados). El encargado los ve sin poder cambiarlos; el profesional no ve la sección.
- **Servicio y promocional.** La lista de espera es de servicio: le llega a quien se anotó. "Te toca volver" y la reseña son promocionales: sólo a quien marcó la casilla de novedades por correo (sin marcar por defecto), y cada correo trae la baja en un clic (también el "Cancelar suscripción" de Gmail y Apple). Después de la baja no le llega ninguno de los dos.
- **Cuándo salen.** La lista de espera, apenas se libera una hora. "Te toca volver", la reseña y el vencimiento de la lista de espera, una vez al día, dentro del cron de los correos de prueba (13:00 UTC): el plan Hobby de Vercel no admite un tercer cron.

**Lista de espera.** En la reserva pública, si el día elegido no tiene horas libres pero sí alguna que se pueda liberar (está en horario, no pasó y no está bloqueada, sólo tomada por una cita), la persona puede tocar "Avísame si se libera una hora" y dejar nombre, apellido, correo (obligatorio) y, si quiere, teléfono. Se anota para ese día, servicio y profesional (o "cualquiera"), sin franja horaria; si el día todavía tiene horas, o ese día no se atiende (cerrado, bloqueado entero o con todas sus horas ya pasadas), se le dice; en esos días la página ni siquiera ofrece "Avísame". Que el día "no se atiende" se mira para todo el negocio, no para el profesional elegido: si nadie que haga el servicio puede atender (cerrado, bloqueo de todo el local o todos bloqueados), no hay "Avísame"; si el elegido está de vacaciones pero otro atiende, la página responde igual que en un día lleno, para no dejar ver la agenda personal de nadie. En ese caso (el elegido no trabaja ese día o está bloqueado entero) la inscripción queda con "cualquiera", sin decirlo: con él nunca se iba a liberar una hora y el aviso no habría llegado (#166). Un mismo correo puede esperar hasta 3 días a la vez en un negocio. En una clínica dental el día se revisa con la duración de la reserva (con los 15 minutos de la primera vez, si los suma), y una urgencia sólo espera por hoy, como sólo se reserva para hoy. Cuando se libera una hora futura (el cliente cancela o reagenda; el local cancela, mueve o borra una cita), Eli revisa quién esperaba ese día y si ahora hay hora para su servicio y profesional, y les manda un correo con la reserva ya llenada: hasta 10 personas por hora liberada, hasta 3 avisos por persona y no más de uno por hora. La hora es de quien confirme primero; al que llega después le dice "El horario ya no está disponible". Al reservar con el mismo correo para ese día, la inscripción queda como "reservó" y no se le vuelve a avisar. Cada aviso trae "Salir de la lista" (también en un clic). Al día siguiente las inscripciones vencen, y al vencer, reservar o salir se borran sus datos personales. Dueña y encargado ven la lista del día en la Agenda y pueden quitar a alguien. La casilla de novedades por correo de la reserva pública aparece sólo si se escribe un correo y se guarda sólo al crear un cliente nuevo: sobre un cliente que ya existía no se escribe (quien conoce su nombre y correo no puede dar el consentimiento por él).

**Te toca volver.** Si la dueña lo enciende, una vez al día sale un correo "Ya te toca volver" a los clientes con consentimiento cuando pasó su ritmo habitual desde la última visita y no tienen una hora tomada. El ritmo es la mediana de días entre sus visitas (con al menos 3); si no tiene, la frecuencia del servicio de su última visita, que la dueña o el encargado ponen en Configuración › Servicios ("Cada cuántos días vuelve un cliente", opcional, de 7 a 365 días); sin ninguna de las dos no se le escribe. Sale una vez por visita. Los días se cuentan en la zona del negocio.

**Se están yendo.** En Clientes, dueña y encargado ven quiénes no vienen hace 1,5 veces su ritmo o más y no tienen una hora tomada, con los días sin venir, su ritmo y su último servicio. "Escribirle" abre el WhatsApp o el correo de quien mira con un mensaje sugerido: lo manda la persona, sin costo. Queda anotado en "Mensajes de este mes" y el cliente sale de la lista por 14 días. El profesional no ve esta lista.

**Pedir reseña en Google.** El día siguiente a una visita finalizada (en la zona del negocio), a todos por igual, sin filtrar por cómo le fue, con un máximo de una vez cada 90 días por cliente. Una visita anulada no la pide. Necesita el enlace de reseñas en Configuración › Tu página pública (https de g.page, maps.app.goo.gl, google.com/maps o search.google.com/local/writereview): sin enlace no se enciende, y borrarlo lo apaga.

**Mensajes de este mes.** Una tarjeta en Configuración › Mensajes a clientes cuenta los envíos del mes por tipo, por servicio o promocional y por correo o manual.

### Clínica dental

Un negocio de rubro `odontologia` ve, además de todo lo anterior, lo clínico. En los otros rubros nada de esto aparece y sus endpoints responden 404, como lo de otro negocio. Quién ve qué, en la sección 5 ("En una clínica dental").

- **Vocabulario:** Pacientes, Sala de espera, Odontólogo y Motivo (sección 1).
- **Ficha clínica** del paciente:
  - **Antecedentes:** fecha de nacimiento (la ficha muestra la edad), previsión (Fonasa, Isapre, particular u otra), alergias y enfermedades o medicamentos.
  - **Odontograma** en notación FDI, dibujado en arcada: dentición permanente (11 a 48) y temporal (51 a 85), cinco caras por pieza (vestibular, palatina o lingual, mesial, distal, oclusal o incisal). Por cara: caries, obturación o sellante. Por pieza: corona, endodoncia, ausente o extracción indicada. Muestra quién lo actualizó por última vez y cuándo, un resumen (caras con caries, caras obturadas, piezas ausentes, por extraer) y los hallazgos por pieza. Las reglas viven en `lib/odontograma.ts` y la base las repite.
  - **Evoluciones:** lo que se hizo en cada atención, con fecha y autor. **Sólo se agregan:** no se editan ni se borran (la base lo impide).
- **Alerta de alergias** en el panel de la cita, en la ficha y en el panel del paciente en Pacientes, para todo el equipo de la clínica.
- **Plan de tratamiento y presupuesto**, por etapas y con versiones (rehacerlo crea una versión nueva; vale una sola a la vez). Se arma desde el odontograma: una pieza con caries propone una restauración con esas caras, una extracción indicada propone una exodoncia, con el servicio del catálogo que coincida por nombre (o en $0, para que el odontólogo lo elija). Cada prestación lleva pieza (o "Boca"), caras, prestación, profesional, estado (por agendar, agendada, realizada) y valor; cada etapa está por aprobar o aprobada. "Presentar al paciente" **sólo registra** que se presentó: Eli no lo manda por ningún canal. Totales: total del plan, aprobado y realizado. **El plan sigue sin abonos, sin pagos y sin PDF** (las prótesis sí se abonan, abajo).
- **Sillones:** nombre, orden y activo; se desactivan, no se borran. Una cita lleva un sillón opcional, que asigna la clínica. La agenda se ve en columnas por sillón o por odontólogo, y el inicio muestra "Sillones ahora" y los presupuestos por responder.
- **Prótesis:** una pestaña de la ficha para diseñarlas sobre la arcada, con material, laboratorio y seguimiento hasta la entrega. Se cobran por abonos en la Sala de espera y su valor se reparte en tres partes (odontóloga tratante, clínica y técnico; sección 3.11). Los laboratorios son externos: Eli lleva lo que se les debe.
- **Reserva pública dental:** el paso "Motivo" (los servicios). "¿Es tu primera vez?" suma 15 minutos a la cita (los suma el servidor). Un motivo marcado como urgencia sólo ofrece horas de hoy, y el servidor lo vuelve a revisar al confirmar. Las reservas públicas no asignan sillón.

**Sillones.** Cada sillón tiene nombre (único en la clínica sin distinguir mayúsculas, hasta 40 caracteres), orden (el de las columnas de la agenda y de "Sillones ahora") y si está activo. Se gestionan en Configuración › Sillones: la dueña y el encargado los agregan, renombran, ordenan y activan o desactivan; el odontólogo los ve en la agenda y en el inicio, pero no tiene esa sección. **No se borran: se desactivan.** Uno desactivado deja de ofrecerse para citas nuevas y para cambiar de sillón; las citas que ya lo tienen lo conservan. La cita lleva un sillón **opcional**: se elige en "Nueva cita" y en "Cambiar fecha y hora", o después con "Asignar sillón", desde el detalle de la cita o desde la sala de espera del inicio (todo el equipo de la clínica; el odontólogo, sólo en sus citas). Una cita cancelada, completada o de "No vino" no cambia de sillón.

**Un sillón atiende a una persona a la vez.** Si al crear, mover, reactivar o asignar una cita su horario se pisa con otra del mismo sillón (las canceladas y las de "No vino" no cuentan; tocarse no es pisarse), Eli no la guarda: a dueña y encargado les dice con qué choca ("Sillón 1 ya tiene una cita de 10:00 a 11:00. Elige otro sillón u otra hora."); al odontólogo, sin las horas ("Sillón 1 está ocupado a esa hora. Elige otro sillón u otra hora."), porque son citas de colegas que no ve. A diferencia del choque de profesional (arriba, "Crear y mover una cita"), **no hay "guardar igual"**. El choque se vuelve a revisar al guardar, con el sillón trabado: dos personas que guardan a la vez no dejan dos citas en el mismo sillón y la misma hora.

**La reserva pública no asigna sillón:** la cita llega "Sin sillón" y se lo pone la clínica. **Reagendar por el enlace conserva el sillón:** sólo ofrece horas en que ese sillón está libre y lo vuelve a revisar al confirmar; si entretanto se ocupó, responde "Esa hora ya no está disponible. Elige otra.", sin nombrarle el sillón al paciente.

**Agenda de la clínica.** La vista Día es una grilla con una columna por sillón (así abre) o por odontólogo ("Ver por"), en filas de 15 minutos con la hora cada media hora. Por sillón: los activos en su orden, uno desactivado sólo si ese día tiene citas, y al final "Sin sillón" si hay citas sin sillón. Por odontólogo: quienes atienden y, al final, "Sin odontólogo" (ahí van también las de la dueña, que no es parte del equipo). Hoy la grilla se abre una hora antes de la actual y una línea marca la hora; las citas que se pisan en una columna van lado a lado, y cada una dice su hora, el paciente, el estado en palabras y el motivo. Los bloqueos se listan arriba de la grilla (de ahí se abren) y adentro son una franja rayada. El odontólogo ve sólo sus citas, como en toda la agenda. Sin sillones activos, la vista lo avisa (a dueña y encargado, con el enlace a Configuración). Semana y Mes son las de siempre. El panel de la cita suma, en una clínica, la alerta de alergias, el sillón, "Asignar sillón" y "Abrir ficha".

**Inicio de la clínica.** Arriba del inicio de siempre, tres tarjetas que se vuelven a pedir cada minuto y después de cada acción:

- **Sillones ahora:** cada sillón activo, "Atendiendo" o "Libre", dicho en palabras. **Atendiendo sólo si la atención empezó:** la de su cita está "En atención" en la Sala de espera, o la cita se marcó "en progreso" a mano en la agenda. No se deduce de la hora: que una cita sea "ahora" no dice que el paciente llegó. Atendiendo muestra a quién, el motivo, con qué odontólogo y desde cuándo; libre, hasta qué hora (o "Libre el resto del día") y quién sigue, y si la siguiente ya pasó su hora, que está atrasada.
- **Sala de espera:** quienes llegaron y esperan (los "En espera" de la Sala de espera), los que más esperan primero, con los minutos. Con sillón, "Pasar al sillón" la pasa a "En atención" (como en la Sala de espera, la atención necesita servicio y odontólogo); con cita y sin sillón, "Asignar sillón"; sin reserva, se atiende desde la Sala de espera.
- **Presupuestos por responder:** las etapas del plan vigente que ya se presentaron y siguen por aprobar, de la más reciente a la más vieja, con un enlace a la ficha de cada paciente.

**El odontólogo ve lo suyo y sin montos:** en los sillones, sólo sus citas (un sillón sin citas suyas dice "Sin citas tuyas ahora", no "Libre": puede tenerlo un colega), en la sala de espera lo que ve en la Sala de espera, y los presupuestos de todos sin el monto de cada uno ni el total. Dueña y encargado ven todo el negocio, con montos.

**La ficha del paciente** (`/dashboard/clientes/<id>`, sólo en una clínica; en otro rubro vuelve a Clientes). Se llega desde Pacientes (en pantallas de menos de 1024 px la tarjeta del paciente abre la ficha; en las más anchas abre el panel de al lado, que tiene "Abrir ficha clínica"), desde "Abrir ficha" en el panel de la cita y desde los presupuestos por responder del inicio. Arriba, los datos del paciente y cuatro tarjetas: alergias, próxima cita, cómo va el plan y contacto. Debajo, las pestañas Odontograma, Plan y presupuesto, Prótesis, Evoluciones y Antecedentes. **Quién ve qué:** el dueño y los odontólogos ven y escriben todo, de todos los pacientes; el encargado ve sólo la alerta de alergias y la pestaña del plan, sin editar, y el resto (también la pestaña Prótesis) ni se lee de la base para él (sección 5).

- **Antecedentes:** fecha de nacimiento (no futura ni anterior a 1900; la ficha muestra la edad), previsión, alergias (hasta 500 caracteres) y enfermedades o medicamentos (hasta 4.000). Dejar un campo vacío lo borra. Cada guardado deja quién lo hizo.
- **Odontograma:** se marca con una herramienta elegida (tocar una cara la marca; tocarla otra vez con la misma, la desmarca; "Borrar" en el número limpia la pieza entera), también con el teclado. Los cambios quedan en la pantalla hasta "Guardar odontograma", que manda el odontograma entero: **si dos personas lo editan a la vez, el último que guarda gana.** Mientras haya cambios sin guardar se avisa, y el navegador pregunta antes de salir de la página. Queda quién lo guardó y cuándo; no hay historial de versiones del odontograma (sección 6, "No entra").
- **Evoluciones:** un texto (hasta 4.000 caracteres) con la fecha y el autor y, si se quiere, la cita en que se atendió (de hoy o antes en el día de la clínica, no cancelada; el odontólogo, sólo una suya; una cita de otro día por venir se rechaza). Se listan de la más nueva a la más vieja, de a 30. **No se editan ni se borran**, ni siquiera quien la escribió.

**Alerta de alergias.** Lo anotado en "Alergias" aparece como alerta, en el naranja de atención y con su título (no sólo por el color), para todo el equipo de la clínica, también el encargado: en el panel de la cita en la agenda, primero que todo (si no se pudo leer, lo dice y pide mirar la ficha: nunca muestra "sin alergias" por un error); en la ficha, siempre ("Sin alergias anotadas" si no hay nada, que no es lo mismo que "no tiene alergias"); y en el panel del paciente en Pacientes. De un paciente eliminado no se lee nada clínico.

**Plan de tratamiento.** Vive en la pestaña "Plan y presupuesto". Lo arman y lo cambian el dueño y los odontólogos; el encargado lo ve sin editar.

- **Versiones.** Vale una sola a la vez, la vigente. Una versión nueva se arma desde el odontograma guardado, copiando la vigente (con lo aprobado y lo agendado) o vacía; la anterior queda en "Versiones anteriores", donde se ve sólo su número y su fecha. **Rehacer desde el odontograma reemplaza la versión vigente:** lo aprobado y lo agendado en ella no pasa a la nueva, y por eso la ficha lo confirma antes ("Generar presupuesto" desde el odontograma guarda primero lo que falte). Un odontograma sin caries ni extracciones indicadas no tiene nada que proponer.
- **Etapas.** Cada una está **por aprobar** o **aprobada**. "Presentar al paciente" **sólo registra cuándo se le mostró** (presentarla de nuevo cambia la fecha): Eli no le envía nada por ningún canal, y la pantalla lo dice. "Aprobar" registra cuándo y quién, se haya presentado o no. "Volver a por aprobar" borra la aprobación y la fecha de presentación, para cambiarla y presentarla de nuevo. Una etapa sin prestaciones no se presenta ni se aprueba, y sólo se borra si está por aprobar y nada en ella está agendado ni realizado.
- **Prestaciones.** Cada una con pieza (o "Boca"), las caras que esa pieza tiene, la prestación (un servicio del catálogo, que trae su nombre y su precio, o un nombre escrito a mano), quién la hace (un odontólogo o la dueña; el encargado no atiende, así que no se le asigna) y su valor. Estados: **por agendar** (sin cita), **agendada** (en una cita del paciente que ya está en la agenda: el plan no crea citas, se elige una de las que tiene por delante, que no terminó; no una que ya pasó, cancelada, de "No vino" ni completada; volver a agendada desde otro estado revisa de nuevo la cita) y **realizada** (con la fecha en que se marcó). Se puede volver atrás para corregir. Una prestación se borra sólo si está por agendar y su etapa, por aprobar.
- **En una etapa aprobada** su presupuesto ya se aceptó: de cada prestación sólo cambian el estado, la cita y quién la hace; no se agregan ni se borran prestaciones, ni cambian pieza, caras, prestación o valor. Para eso, se vuelve a poner por aprobar.
- **La agenda y el plan.** **Cancelar una cita** (desde la agenda, por el enlace del paciente, al rechazar una reserva por confirmar o al anular en la Sala de espera la atención de una reserva sin cobrar) o **marcarla "No vino"** devuelve a "por agendar" las prestaciones agendadas en ella; las realizadas no cambian, y las evoluciones siguen atadas a la cita. Reactivarla no las vuelve a agendar: se agendan de nuevo desde el plan. **Borrar una cita** (hoy ninguna pantalla lo ofrece; por la API, sólo dueña y encargado, y no una cita cancelada, completada, de "No vino" ni con su atención en la Sala de espera) hace lo mismo y además suelta de ella lo clínico (las prestaciones realizadas conservan su estado y su fecha; las evoluciones, su texto): nada se pierde, sólo deja de apuntar a una cita que ya no existe.
- **Totales:** total del plan (todas las prestaciones de la versión vigente), aprobado (las de las etapas aprobadas) y realizado (las realizadas, de cualquier etapa); cada etapa muestra su subtotal. **El plan no tiene abonos, pagos ni PDF:** el plan no es un cobro. Lo que se cobra sigue pasando por la Sala de espera como cualquier atención, y la comisión de las prestaciones no cambia (sección 3). Una prótesis agregada al plan es una prestación más del presupuesto; se cobra con abonos a la prótesis, no desde el plan (abajo).

**Prótesis.** Vive en la pestaña "Prótesis" de la ficha, entre "Plan y presupuesto" y "Evoluciones". La ven, crean y avanzan el dueño y los odontólogos, para cualquier paciente; el encargado no la ve. Muestra el historial de prótesis del paciente (la más nueva primero), cada una con su valor, lo pagado (abonos de atenciones cobradas) y el saldo, su seguimiento y su reparto sin editar (sección 3.11).

- **Diseño sobre la arcada.** Se elige el **tipo** (removible parcial, total, fija o puente, sobre implantes o corona unitaria), la **arcada** (superior, inferior o ambas) y se marcan sobre el dibujo del odontograma las **piezas protésicas** y los **pilares o ganchos**, en FDI permanente (no sobre temporales; lo ausente o con extracción indicada en el odontograma se ve punteado). **Sin cordales** (decisión del dueño, 2026-11-09): las piezas que terminan en 8 (18, 28, 38 y 48) no son piezas protésicas ni pilares. Una pieza no es a la vez protésica y pilar. La total toma todas las piezas de la arcada menos los cordales (14 por arcada) y no lleva pilares; la corona es una sola pieza, sin pilares; con "Ambas" hay piezas arriba y abajo. Sólo la removible y la total llevan **zonas de la base**: paladar (sólo arriba), barra lingual (sólo abajo), flanco vestibular, rebasado y reparación de base.
- **Material y precio.** El material se elige del catálogo de la clínica, entre los activos que sirven para ese tipo. Los materiales **por arcada** (removible y total) cobran precio × arcadas (1, o 2 con "Ambas"); los **por pieza** (fija, implantes y corona), precio × (piezas protésicas + pilares). **El valor lo calcula el servidor** con el precio del catálogo y queda fijo con la prótesis: lo que mande el navegador no cuenta, y cambiar después el precio del material no la toca.
- **Tratante, laboratorio, entrega y tono.** El odontólogo que la crea queda como tratante; la dueña elige a un odontólogo o a sí misma. **La tratante sólo puede ser la dueña o un odontólogo**: el encargado no (el servidor lo rechaza). El laboratorio (con su contacto, si tiene) viene del que el material tenga por defecto y se puede cambiar (o dejar sin laboratorio); la entrega estimada es opcional. El **tono del diente** es opcional, de la guía VITA classical (0M1, 0M2, 0M3, A1, A2, A3, A3,5, A4, B1–B4, C1–C4, D2, D3, D4, por grupos: blanqueamiento 0M, A rojizo-marrón, B rojizo-amarillo, C gris y D rojizo-gris); la pantalla muestra un color de referencia aproximado, pero manda la guía física. Laboratorio, entrega estimada y tono se cambian hasta que se entrega o se anula. El diseño, el material, el valor y el reparto no cambian después de creada (la base lo impide).
- **Seguimiento por tipo** (decisión del dueño, 2026-11-09): la removible y la total pasan por **Toma de impresión → Prueba de rodete → Prueba de enfilado → Entregada**; la fija o puente, la corona unitaria y la de implantes, por **Toma de impresión → Prueba → Entregada**. **Sólo hacia adelante** (se puede saltar un paso, no volver), con la fecha y el autor de cada paso. El laboratorio es un dato de la prótesis, no un paso: avanzar no pide laboratorio, y Eli no le manda nada. **Entregar sí lo pide si el técnico lleva parte** (decidido el 2026-11-09): si la regla congelada le da algo al técnico y la prótesis no tiene laboratorio, no se entrega ("Asigna el laboratorio antes de entregar: se le debe su parte"); "Marcar como entregada" lleva primero a elegirlo. Si no, esa parte quedaría sin laboratorio a quién pagársela, y una entregada ya no cambia. La odontóloga no ve la parte del técnico: la pantalla sólo sabe que hace falta un laboratorio. La base lo exige también. **"Entregada" no se deshace**, pide confirmar y libera la liquidación (sección 3.11). Las prótesis creadas antes del cambio pasaron a los pasos nuevos ("En laboratorio" quedó como toma de impresión; "Prueba en boca" y "Ajustes", como prueba de enfilado en removible y total, y como prueba en las demás).
- **Anular:** sólo antes de entregar y **sin abonos** (ni cobrados ni por cobrar en una atención abierta): si tiene, responde que no se puede y por qué. Queda en el historial como anulada, con fecha y autor, y ya no recibe abonos.
- **"Agregar al plan y presupuesto"** crea en el plan vigente una prestación de "Boca" ligada a la prótesis, con un nombre armado (p. ej. "Removible parcial · Acrílico termocurado (45, 46, 47)"; la total dice la arcada), su valor y la tratante, por agendar. Va a la etapa elegida, o a la última por aprobar, o a una etapa nueva "Prótesis". No se puede sin plan vigente, dos veces en el mismo plan, con la prótesis anulada ni en una etapa aprobada.

**Materiales.** Toda clínica dental nace con cinco (las que ya existían los recibieron en la migración): Acrílico termocurado (por arcada, removible y total, $180.000, 40/30/30), Flexible (nylon) (por arcada, removible, $320.000, 35/25/40), Cromo-cobalto (por arcada, removible, $450.000, 35/25/40), Metal-porcelana (por pieza, fija, implantes y corona, $220.000, 40/20/40) y Zirconio (por pieza, fija, implantes y corona, $290.000, 35/20/45); el reparto es odontóloga/clínica/técnico. La dueña los gestiona en Comisiones › Reparto de prótesis: nombre (único sin distinguir mayúsculas), unidad, tipos, precio, reparto (sólo se guarda si suma 100 %), laboratorio por defecto y orden, más las excepciones por profesional. **No se borran: se desactivan**; uno desactivado deja de ofrecerse y las prótesis que ya lo usan lo conservan.

**Laboratorios.** Son **externos**: no tienen cuenta en Eli. La dueña los gestiona en Configuración › Laboratorios: nombre (único sin distinguir mayúsculas, hasta 80 caracteres), contacto opcional y si está activo. **No se borran: se desactivan**; los odontólogos eligen en la ficha sólo los activos. El encargado no ve esta sección.

**Por pagar al laboratorio** (sólo la dueña, en Comisiones). La parte del técnico de cada abono cobrado, ya liberada (sección 3.11), se le debe al laboratorio de su prótesis: la lista la agrupa por laboratorio con el total. Lo cobrado antes de "Liquidar desde" no queda por pagar (se pagó por fuera, como en la liquidación). "Marcar pagado" registra el pago (lo seleccionado o todo lo pendiente de ese laboratorio) con el medio, quién y cuándo; paga exactamente los abonos que se veían, de a 1.000 como máximo (con más, lo dice y quedan para otro pago), y si lo por pagar cambió mientras se confirmaba, no paga y la lista se recarga. Un pago se puede anular y sus líneas vuelven a estar por pagar. El historial de pagos muestra también los anulados. **El pago no sale de la caja del día:** no cuenta en el cierre de caja, como los adelantos; es plata que la dueña paga por fuera. No hay liquidación propia del laboratorio: es una lista de lo que se debe y lo que se pagó. **Una atención con un abono ya pagado al laboratorio no se anula** (ni se reactiva su cita) hasta anular ese pago.

**Reserva pública dental.** El primer paso se llama "Motivo" (son los servicios del catálogo) y "¿Con quién?" ofrece odontólogos. "¿Es tu primera vez?" suma 15 minutos a la cita "para abrir tu ficha": **la duración la calcula siempre el servidor**, con la misma cuenta al ofrecer horas y al confirmar, y descarta lo que mande el navegador; así una hora ofrecida no se rechaza después. Un motivo marcado como urgencia sólo ofrece horas de hoy, en la zona del negocio; si hoy ya no quedan, pide llamar a la clínica. El servidor lo vuelve a revisar al confirmar y **también al reagendar por el enlace**: una urgencia sólo se mueve a otra hora de hoy. Hoy la única urgencia es la "Urgencia dental" de los servicios de ejemplo: no hay dónde marcar o desmarcar otro servicio (sección 10). La página pública no recibe nada clínico ni de sillones: sólo si el negocio es una clínica y qué motivo es urgencia. Cancelar por el enlace devuelve a "por agendar" lo agendado en esa cita, como cancelar en el panel.

---

## 7. Tablero de atenciones

Una **atención** es la visita de un cliente al local, con o sin reserva. El tablero muestra el día en columnas (si no entran en la pantalla, se desplazan de costado: un degradado en el borde y, con mouse, una flecha muestran que hay más) y es donde se anota qué se hizo, quién lo hizo y cuánto se cobró. **Los ingresos del negocio son lo cobrado acá.**

| Columna | Qué hay | Para pasar a la siguiente |
|---|---|---|
| **Reservas de hoy** | Las citas del día que todavía no llegaron, por hora. Entran solas. Si la hora pasó, se marcan como atrasadas. | "Llegó" (sólo para reservas del día) |
| **En espera** | Quien llegó, con o sin reserva, y espera ser atendido. | Al menos un servicio con su profesional |
| **En atención** | Quien está siendo atendido. | Cada servicio con su profesional y su precio |
| **Por cobrar** | Atendido; falta pagar ("por cancelar"). | Medios de pago que sumen exactamente el total |
| **Finalizado** | Lo cobrado hoy. Ya no se edita. | — |

**Cada servicio con su profesional.** Una atención tiene una o más líneas: servicio, profesional que lo hizo y precio cobrado. El precio se copia del catálogo y se puede ajustar; el total es la suma de las líneas. Así se sabe cuánto generó cada profesional, que es la base de las comisiones (sección 3). Topes: hasta 20 servicios y $20.000.000 por atención; más que eso es un error de carga, o dos atenciones. Los servicios se cuentan sobre la atención entera, para todos, también el profesional: cuántos servicios hay no es dinero. El monto se valida al anotar o editar los servicios, al pasar a "Por cobrar" y al cobrar, no al empezar ni al volver atrás, para que una atención que se pasó se pueda corregir. Al profesional el monto se le mide sobre sus propios servicios, porque un rechazo no puede revelarle cuánto suman los de sus colegas; el cobro valida siempre la atención entera.

**Al llegar, se precarga lo reservado.** "Llegó" sólo vale para reservas del día calendario de quien marca la llegada (si su dispositivo no informa una zona horaria que el servidor reconozca, para las que estén a menos de 24 horas de ahora). Si la cita tiene servicio y profesional, la atención nace con esa línea (con varios servicios, una por servicio; ver "Varios servicios por reserva"); si falta el profesional, el editor la propone y alguien lo elige. Un "Llegó" marcado por error se deshace mientras la atención no haya empezado, y la reserva vuelve a su columna. Si ya empezó, se anula: queda el rastro.

**El dueño también atiende.** El dueño no es miembro del equipo, así que sus líneas se marcan aparte como suyas y no generan comisión. Si quiere que le cuenten comisión como a cualquiera, se invita como profesional de su negocio y trabaja con ese rol (sección 5, "Una cuenta en varios negocios"): sus líneas van entonces a su nombre de profesional. Si quien hizo una línea deja el equipo, la línea conserva su nombre en el historial. Si todavía no se cobró, alguien tiene que reasignarla antes de cobrar.

**Productos.** Además de servicios, una atención puede llevar productos del catálogo (un shampoo, una cera), a nombre de quien los vendió. Sin inventario ni cantidad: dos unidades son dos líneas. Un producto inactivo no se agrega. Cuentan para el total y para el tope de 20 líneas. La página pública y la agenda no los muestran.

**La comisión se calcula al cobrar.** Cada línea guarda su % y su monto (sección 3.3). Una línea sin % no frena el cobro: queda pendiente. Se avisa antes de cobrar (en el cobro, las líneas que quedarán sin % llevan "Sin %" y un aviso dice cuántas) y otra vez después ("… sin porcentaje de comisión: avísale a la dueña").

**Abonos de prótesis** (sólo en una clínica dental). Dueña y encargado, en una atención abierta del paciente (en espera, en atención o por cobrar), pueden agregar un abono a una de sus prótesis no anuladas: ven de cada una el valor, lo pagado, lo por cobrar en atenciones abiertas y el saldo, sin el reparto. El monto es libre, mayor que cero y con hasta dos decimales, **hasta el saldo**, contando también los abonos por cobrar (dos abonos a la vez van uno detrás del otro y no pasan el valor). La línea queda a nombre de la tratante ("Abono prótesis · …"), cuenta para el total y los topes de la atención, y se quita mientras la atención esté abierta. No lleva la comisión de la cascada: al cobrar, congela su reparto en tres partes (sección 3.11). Ya cobrado, el reparto lo ven la dueña (las tres partes) y la odontóloga tratante (la suya); el encargado, no. Para Reportes y la caja es un cobro como cualquier otro. Si la tratante ya no está en el equipo, el abono se rechaza (sección 10).

**Propinas.** Se anotan al cobrar, hasta 5 por cobro, para quien atendió. No suman al total ni a los ingresos (los pagos siguen sumando exactamente el total). Van completas al profesional y se le pagan en la liquidación; la de la dueña no entra a ninguna.

**Pago dividido.** Medios fijos: efectivo, tarjeta de débito, tarjeta de crédito, transferencia y billetera digital. Un cobro se puede repartir entre varios medios. La suma tiene que coincidir con el total al centavo: se calcula en centavos enteros, nunca con decimales sueltos.

**Lo cobrado no se reescribe.** Una vez finalizada, la atención no se edita. Si hubo un error, el dueño la anula, también días después desde Reportes: queda en el historial de anuladas (quién, cuándo y por qué) y deja de sumar. **Lo rendido no se anula:** una atención que ya entró en una liquidación no anulada o en un cierre de caja se corrige con un ajuste en la liquidación; si se intenta anular desde el Tablero o desde Reportes, el modal lo dice sin cerrarse ni borrar el motivo escrito, y ya no ofrece anular. Si un cierre (de caja o de liquidación) está en curso, cobrar, anular y reactivar una cita esperan a que termine: así no se cuela nada a mitad de un cierre. El nombre de quien cobró y de quien anuló se guarda con la atención, y se conserva aunque esa persona deje el negocio. Si alguien se va sin ser atendido, también se anula. En una clínica dental, una atención con un abono de prótesis ya pagado al laboratorio no se anula (ni se reactiva su cita) hasta anular ese pago: eso no se corrige con un ajuste.

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
- **Cómo se anota el cliente.** En `/fila/<su-página>` (el enlace o el QR de la pantalla del local) escribe su nombre y, si quiere, su correo. Sólo mientras el local está abierto según su horario de atención y su zona horaria, y fuera de un bloqueo de todo el negocio (un feriado o un cierre anotado en la agenda; el bloqueo de un solo profesional no cierra la fila); fuera de horario la página lo dice. Si ya hay tantas personas esperando como el máximo, la fila está "llena por ahora". Con la fila apagada, la página no existe. Toma el número siguiente de la jornada (1, 2, 3…; cada jornada empieza en 1 y un número nunca se repite, aunque alguien haya salido). La jornada termina a las 05:00 en la zona del negocio, no a medianoche: un local que atiende pasada la medianoche no reinicia los números ni deja como vencidos a quienes todavía esperan. Quien quedó esperando de una jornada anterior ve su turno como vencido. El teléfono recuerda su turno: si vuelve a abrir el enlace general mientras sigue esperando o lo están atendiendo, ve su número en vez del formulario (sólo el número, nunca el nombre), con "Anotar a otra persona" como acción principal y "Ver mi turno" al lado. "Anotar a otra persona" olvida el turno guardado en ese navegador, para que quien llega después a un equipo compartido no entre al turno de otro (que muestra su nombre y deja sacarlo de la fila). Si el navegador no guarda datos (ventana privada), se ve el formulario como siempre. **El enlace y el QR son para el teléfono de cada persona:** no conviene dejar la página de la fila abierta en un equipo compartido (una tablet del local para que se anote quien no tiene celular), porque el turno de uno queda a la mano del siguiente hasta que alguien toca "Anotar a otra persona".
- **Qué ve en el celular.** Su número en grande, cuántas personas tiene adelante y un tiempo estimado, que se actualizan solos cada 20 segundos. La estimación es personas adelante × la duración promedio de los servicios activos del negocio (entre 5 y 120 minutos por persona; 20 si no hay servicios), redondeada a 5 minutos: es una cota gruesa, no cuenta que varios profesionales atienden a la vez. No ve nombres ni datos de nadie más. Puede **salir de la fila**: su atención queda anulada. Cuando lo empiezan a atender, la página dice "Es tu turno". El enlace es personal (lleva un código que sólo existe en ese enlace).
- **En el Tablero.** Quien se anota entra en "En espera" como cualquier llegada sin reserva, con su número ("Turno 7"). Se atiende, se cobra o se anula igual que las demás (anular a quien no vino es "se fue sin ser atendido").
- **Pantalla del local.** Dueña y encargado la abren desde el Tablero ("Pantalla de la fila", cuando está encendida). Es para un televisor o una tablet: usa la sesión de quien la abre, así que en ese equipo queda abierto el panel de esa cuenta (Configuración lo advierte: no dejar el panel a mano de los clientes). Tapa el panel, tiene botón de pantalla completa y se actualiza sola cada 15 segundos. Muestra quién se está atendiendo y la fila de espera, con el número y el nombre con la inicial del apellido ("Juan P."), nunca el correo ni el teléfono, y en grande el QR y el enlace para anotarse. El profesional no la ve.
- **Aviso "ya casi es tu turno".** A quien dejó su correo le llega un correo una sola vez, cuando queda con una persona adelante (o con ninguna, si salieron dos a la vez). Lo saluda sólo por su primer nombre. Sale cuando alguien de la fila deja de esperar (pasa a atención, sale o lo anulan) y cuando alguien se anota, por si quedó con una o ninguna persona adelante. Es de servicio (lo pidió al anotarse) y no trae enlace a su turno: Eli no guarda el código del enlace, sólo una huella. Si el envío falla, se reintenta en el siguiente movimiento de la fila.
- **Vaciar la fila de hoy.** Dueña y encargado, desde el Tablero cuando hay alguien esperando en la fila (aunque esté apagada): anula de una vez a todos los que esperan en la fila de la jornada, después de confirmarlo. Los que ya se atienden siguen. Sirve si alguien la llenó con nombres inventados. Cada atención anulada guarda quién la vació.
- **Límites.** Desde una misma conexión, 10 intentos por hora (los clientes en el wifi del local comparten conexión). Por negocio, 60 anotaciones por hora: sólo cuentan las que quedaron anotadas, no los intentos rechazados (local cerrado o fila llena), para que nadie pueda gastar ese cupo y dejar afuera a la gente real. El nombre, hasta 40 caracteres. Mirar el turno, unas 4 consultas por minuto por enlace.

### Cierre de caja

Dueña y encargado cierran la caja cuantas veces quieran al día. Cada cierre cubre desde el anterior (el primero, desde el inicio del día en la zona del negocio) hasta la hora en que se leyó la caja para contar (la pantalla la dice, y "Actualizar" la trae a ahora): lo que se cobre después queda para el próximo cierre. Cerrar pide confirmación con el esperado, lo contado y la diferencia; si lo cobrado en ese período ya no da el esperado que se vio (un cobro o una anulación que se cruzó), no cierra y la caja se recarga. Si la caja arrastra cobros de días anteriores (no se cerró después de ellos), la pantalla de cierre lo avisa y dice desde qué día: el cierre los incluye igual, para no dejar huecos. **Esperado = fondo inicial + efectivo cobrado + propinas en efectivo**; se anota lo contado y la diferencia, con nota obligatoria si no cuadra. Los otros medios se muestran sólo como referencia. Los adelantos pagados desde la caja no cuentan en esta versión, ni los pagos al laboratorio (sección 6, "Por pagar al laboratorio"). Un cierre no se edita, y lo cobrado dentro de un cierre ya no se anula ni se reactiva su cita.

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

**Llenar horas** (pestaña aparte, dueña y encargado), en la zona del negocio: ocupación por profesional (citas dentro de su horario, menos bloqueos; sólo cuentan quienes atienden: el encargado no suma capacidad ni presta su horario a un profesional un día sin horario general), clientes nuevos y que volvieron, tasa de "No vino", y la comparación con el período anterior de igual largo.

---

## 9. Branding — dirección propuesta

> Pendiente de decidir. Esta es la dirección que se desprende del posicionamiento.

Con el diferenciador definido, la identidad ya no debería comunicar "agenda bonita" sino **claridad y confianza con el dinero**. Un producto que reparte plata entre personas tiene que verse exacto, no simpático.

| Elemento | Dirección |
|---|---|
| **Nombre** | A decidir: mantener *Eli* o cambiar |
| **Tono** | Claro y directo. Nada de jerga técnica ni de promesas infladas |
| **Atributos** | Exactitud, transparencia, calma |
| **Evitar** | Rubros fuera de los cuatro elegidos (consultorios que no son dentales, gimnasios, yoga); cifras no verificables |

**Frase de cierre vigente:** *Deja de complicarte. Pásate a Eli.*

**La landing nueva** (decidida el 2026-11-06): abre con *Llevas todo enredado. Eli lo acomoda.* y sigue el diseño que aprobó el dueño, sección por sección. Usa la paleta **Frutos rojos** (frambuesa, ciruela y pistacho, con la acción principal en cereza) y titulares en Geist, **sólo en la landing**: el panel, la reserva pública y el acceso siguen con navy, crema y los pasteles de cada módulo. Habla de **cuatro oficios** —peluquería, barbería, uñas y odontología— en Áreas, Oficios, el menú "Para quién" y el pie. Las maquetas del producto son HTML, no imágenes, y muestran sólo lo que Eli hace; los precios salen de `lib/precios.ts`. Las fotos de Áreas y Oficios todavía no están: hasta que el dueño las suba, cada una es un bloque de color con el ícono del oficio (sección 10). El pie dice "Un producto de Sistema One" (con el enlace a su sitio) y, en la línea legal, "© 2026 Eli · Sistema One" (con el año en curso), sin "SpA" mientras la razón social no esté confirmada. La barra de anuncio de arriba dejó de mostrarse.

La paleta, la tipografía y cada sección de la landing están en `docs/diseno/README.md`.

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
| **Turnos y zona horaria** | Ya decidido: la zona horaria es **por negocio**, con `America/Santiago` por defecto (sección 6); la usan la reserva pública, la agenda y los recordatorios. Decidido el 2026-11-05: el inicio, los reportes y el Tablero siguen calculando el día en la zona del dispositivo (Chile). Falta: la pantalla para que el dueño la cambie y si cada negocio define sus propios turnos. |
| **Agenda: bloqueos y "No vino"** | Ya decidido: "No vino" se deshace reactivando la cita (dueña y encargado, sección 6). Muchas inasistencias ya tienen consecuencia: la reserva entra por confirmar (sección 6, "Reservas por confirmar tras faltas"). Con el plan Pro de Vercel, el recordatorio podría salir a una hora fija en la zona de cada negocio. |
| **Página pública: fotos** | La página ya muestra logo, portada y fotos del equipo si existen, pero no hay subida: falta aprobar el almacenamiento (propuesto Cloudflare R2), y con él abrir la CSP (`img-src`) a ese origen. Hasta entonces se usa el color y las iniciales. También falta decidir si el encargado que atiende aparece en "Equipo" (llega con el interruptor "también atiende"). |
| **Corregir un cobro** | Hoy lo cobrado se anula, también días después desde Reportes, salvo que ya haya entrado en un cierre de caja o en una liquidación: entonces se corrige con un ajuste. Falta decidir si el dueño puede reabrirlo y corregirlo, y con qué registro. |
| **Roles** | Si hace falta un super administrador de la plataforma, y si el cliente final puede crear cuenta para ver su historial (cancelar y reagendar ya se hace sin cuenta, con el enlace del correo). |
| **Reserva por profesional** | Hoy sólo se ofrecen los profesionales: el dueño que también atiende y el encargado con "también atiende" entran con ese interruptor (fila Cobro). Las citas sin profesional asignado ocupan a todos; la agenda las destaca y dueña y encargado las asignan (sección 6). Al reagendar se mantiene el profesional; cambiarlo desde el enlace no está. |
| **Clientes y el profesional** | Ya decidido: el profesional ve los clientes del negocio, puede crearlos (los necesita para anotar a quien llega) y editar sólo sus **notas**. Cambiar los datos (nombre, teléfono, email, etiquetas...) y borrar un cliente es de dueño y encargado. El servidor lo aplica con `puedeEditarDatosDeCliente` y `puedeBorrarCliente` (`lib/permisos.ts`). Importar y exportar clientes y atenciones en CSV también es de dueño y encargado (`puedeImportarExportarClientes`). |
| **Clientes: datos pendientes** | Los teléfonos guardados antes de normalizar se pasan a `+56` con `scripts/normalizar-telefonos.ts` cuando el dueño lo corra; los ilegibles siguen obligando a corregirlos al editar la ficha (#92). El cliente no tiene fecha de nacimiento, así que la importación no la lee. |
| **Mensajes a clientes** | Ya construido por correo (sección 6, "Mensajes a clientes"). Esperan la SpA y la decisión de precios: los mensajes por WhatsApp (y con ellos el ofrecimiento de a uno, "el primero y a los 10 minutos el siguiente", de la lista de espera), los topes de mensajes por plan, el aviso al 80 % y los packs. Falta confirmar con el plan de Resend el tope de 100 correos por corrida: el gratuito comparte unos 100 al día con los recordatorios y los correos de prueba. Decidido por los agentes, a confirmar: una hora entre avisos a la misma inscripción, 14 días oculto tras "Escribirle", 2 años de historial para el ritmo, y que una reseña que no salió en su corrida no se reintenta al día siguiente. |
| **Notificaciones push** | Fuera de esta etapa (#112). |
| **Clínica dental: conservar la ficha** | Eliminar un paciente lo anonimiza (sección 6, Clientes), pero su ficha clínica, su odontograma, sus evoluciones y su plan quedan en la base, aunque desde ese momento ninguna pantalla los lee: las evoluciones no se pueden editar ni borrar, salvo en cascada al borrar la fila del paciente o el negocio entero. Y la Ley 20.584 (derechos y deberes de los pacientes) obliga a conservar la ficha clínica, así que borrarla con el paciente tampoco es la respuesta obvia. Las prótesis tampoco se borran con él: la app no borra la fila del paciente (lo anonimiza), y aunque se borrara a mano, la base lo frena si alguna prótesis suya tiene abonos (historial de cobro) o está en su plan. Falta decidir, **a confirmar con un abogado**: si eliminar un paciente conserva su ficha clínica y por cuánto tiempo, cómo convive eso con el derecho a supresión, y qué pasa con lo clínico al borrar un negocio. |
| **Clínica dental: sacar a alguien del equipo** | Hoy Eli no tiene cómo sacar a una persona del equipo (no hay endpoint). Cuando exista, en una clínica tiene que desvincularla de lo clínico antes de borrarla: sus evoluciones y las prestaciones del plan a su nombre conservan el nombre copiado y dejan de apuntarle. La base no deja borrar a un miembro con evoluciones, prestaciones o prótesis, y de una evolución sólo deja soltar ese vínculo. |
| **Clínica dental: el plan y la agenda** | Preguntas abiertas, que hoy funcionan como se describe: ¿marcar "No vino" devuelve a "por agendar" las prestaciones agendadas en esa cita, como cancelarla? (decidido en la revisión pre-despliegue: sí, como cancelar). ¿Cobrar la atención o completar la cita marca realizada la prestación? (hoy no: se marca en el plan). ¿El encargado, que hace de recepción, puede agendar las prestaciones del plan? (hoy sólo lo ve). ¿El odontólogo debe ver los montos del plan? (hoy sí en la ficha; en el inicio, no). |
| **Clínica dental: lo que falta** | Fuera de esta etapa (sección 6, "No entra"): abonos y pagos del plan, el PDF del presupuesto, y documentos, radiografías y consentimientos, que esperan el mismo almacenamiento que las fotos de la página pública (fila "Página pública: fotos"). Tampoco hay dónde marcar o desmarcar un servicio como urgencia: hoy lo es sólo la "Urgencia dental" con que nace la clínica (sección 6, "Reserva pública dental"). |
| **Clínica dental: prótesis** | Fuera de esta etapa, por decisión del dueño: el costo de materiales (el reparto es sobre lo cobrado al paciente), el correo al laboratorio (el laboratorio es un dato de la prótesis; Eli no le manda nada) y una liquidación propia del laboratorio (hay una lista de lo que se le debe y lo pagado). Pendientes: **una prótesis cuya tratante dejó el equipo** no recibe abonos (responde que su parte no tiene a quién liquidarse y pide avisar a la dueña): falta decidir a quién va su parte y cómo se reasigna. **El historial de cambios de reparto** se guarda pero no tiene pantalla. **El saldo de la ficha** descuenta sólo lo cobrado, mientras que el de la Sala de espera descuenta también los abonos por cobrar en atenciones abiertas: pueden no coincidir mientras haya uno abierto. **Reportes agrupa los abonos por el nombre de la línea** ("Abono prótesis · …"), como servicios fuera del catálogo: en el desglose por servicio cada nombre es una fila, y dos prótesis con el mismo nombre se suman juntas. Falta decidir si van en una sola fila "Prótesis". |
| **Chats** | Chats: escondido del panel hasta que exista un canal real (WhatsApp). Hoy los mensajes no le llegan al cliente, todos se guardan como 'del negocio' sin autor y la conversación no está ligada a la ficha del cliente. El código y las tablas se conservan. |
| **Branding** | Nombre definitivo (mantener *Eli* o cambiar), dominio, y tono: cercano o sobrio. Confirmar la razón social **"Sistema One SpA"**: la línea legal del pie de la landing dice "© 2026 Eli · Sistema One", sin "SpA", hasta que se confirme que la sociedad existe (sección 9). |
| **Landing: fotos** | Las fotos y los videos del diseño no se pudieron descargar. Hasta que el dueño las suba, cada foto de Áreas y de Oficios es un bloque de color con el ícono del oficio (nunca una imagen rota). Se esperan JPG verticales de 3:4, de unos 600 × 800 px. En `public/landing/areas/`: `peluqueria-1.jpg`, `peluqueria-2.jpg`, `peluqueria-3.jpg`, `barberia-1.jpg` a `barberia-3.jpg`, `unas-1.jpg` a `unas-3.jpg` y `odontologia-1.jpg` a `odontologia-3.jpg` (en el diseño, la primera de peluquería y la primera de odontología eran videos: van como fotos, porque un video que se mueve solo pediría su propio botón de pausa). En `public/landing/oficios/`: `peluqueria.jpg`, `barberia.jpg`, `unas.jpg` y `odontologia.jpg`. Al subir cada una, se escribe su nombre en `archivo`: en `AREAS` de `components/landing/seccion-areas.tsx` y en `FOTOS` de `components/landing/seccion-oficios.tsx`. |
| **Deuda: referido propio (B1)** | Un dueño puede ganar los 7 días extra creando una segunda cuenta con su enlace y reservando en ella. Acotado: se da una sola vez por negocio y todavía no hay cobro. Mitigación futura: contar el referido sólo cuando la cita se marca atendida, o exigir correo verificado. |
| **Deuda: correo sin verificar (B4)** | El registro con correo no verifica el email, así que la bienvenida y los correos de la prueba pueden llegarle a un tercero. Acotado por el rate limit del registro y el enlace de baja. Mitigación futura: verificación de correo. |
| **No funcionales** | Móvil primero (un barbero gestiona desde el teléfono); zonas horarias y país; sólo español o también inglés; política de privacidad y retención de datos de clientes. Mientras no existan los términos y la política de privacidad, crear cuenta no muestra la línea "aceptas los Términos y la Política de privacidad": enlazaba a páginas que no existen. Vuelve cuando estén. |

### Decidido el 2026-11-05: se queda como funciona hoy

Con la v1 congelada, el dueño revisó estas preguntas abiertas y decidió no cambiar nada. Quedan como reglas, no como pendientes:

- **Completar desde la agenda sin cobrar** sigue permitido (#101). No suma ingresos (sección 7).
- **Deshacer "No vino"** devuelve la cita a confirmada (sección 6).
- **La dueña y el encargado no reciben citas:** ni en la reserva pública ni en el selector del panel, hasta el interruptor "también atiende" (fila Cobro).
- **La fila virtual abre con el horario del negocio** (#163), no con el de cada profesional.
- **Exportar atenciones excluye a los clientes eliminados** (#91), aunque el total no coincida con Reportes.
- **Reagendar por el enlace cobra el precio de hoy** (catálogo y hora valle de hoy), salvo un precio puesto a mano en el panel (sección 6).
- **Un total con servicios sin precio** se muestra con "+ a consultar".
- **Sin QR rotativo** en la fila virtual: el enlace y el QR son fijos.
- **La vista previa de la liquidación** es sólo de la dueña (sección 3.4).
- **"No vino" se puede marcar en una reserva por confirmar** cuya hora ya pasó, como en cualquier pendiente.
- **Los clientes sin correo pueden quedar repetidos** (#167): reconocer a alguien sólo por nombre o teléfono le daría a un tercero la ficha de otra persona.
- **El inicio, los reportes y el Tablero calculan el día en la zona del dispositivo** (Chile), no en la del negocio.
- **La reserva pública no completa el teléfono ni el consentimiento de un cliente que ya existía** (#109, #115): lo dado queda en la nota interna de la cita (sección 6).
- **La lista de espera con un profesional que no atiende ese día** queda con "cualquiera" (#166).
- **Importar clientes es todo o nada:** si algo falla, no queda ninguno a medias (sección 6, Clientes).
