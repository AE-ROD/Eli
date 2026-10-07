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

> La rama `f-003-comisiones` (sin fusionar, nacida de `main`) guarda el congelado en la cita. Al integrarla hay que moverlo a las líneas de la atención.

---

## 4. Modelo de negocio

**Suscripción mensual por negocio.**

No se cobra comisión sobre las reservas. Eli **administra** el dinero del negocio, no lo toca. Cobrarle un porcentaje a quien usa Eli justamente para repartir porcentajes sería contradictorio, y además obligaría a procesar pagos de terceros.

Precio, límites por plan y prueba gratuita: pendientes (sección 10).

**Regla firme:** no se vende ninguna función que no exista. La versión anterior listaba "reportes exportables" en planes pagos sin haberlos construido — eso es motivo directo de reembolso.

---

## 5. Roles

| Rol | Alcance |
|---|---|
| **Dueño** | Todo, incluidos los porcentajes de comisión |
| **Encargado** | Equipo, agenda, horarios, clientes y cobros del tablero. Sin acceso a configuración de comisiones |
| **Profesional** | Su agenda, sus atenciones, sus clientes atendidos y su propia liquidación |
| **Cliente final** | Reserva desde la página pública, sin cuenta |

El profesional **no ve la facturación del negocio**, sólo lo suyo. Con comisiones de por medio, cuánto factura el local es información del dueño.

---

## 6. Alcance de v1

**Entra:**
- Reservas, agenda y clientes
- **Tablero de atenciones**, con y sin reserva, y registro de cobros (sección 7)
- **Reportes** de lo atendido y cobrado, con filtros (sección 8)
- Equipo con los tres roles reales
- **Comisiones: ciclo completo** (configurar, calcular, liquidar, auditar)
- Elegir profesional al reservar
- Página pública de reservas
- Recordatorios automáticos por correo

**No entra:**
- Cobro online al cliente final
- Reportes exportables
- Aplicación móvil nativa
- Multi-sucursal

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

**Cada servicio con su profesional.** Una atención tiene una o más líneas: servicio, profesional que lo hizo y precio cobrado. El precio se copia del catálogo y se puede ajustar; el total es la suma de las líneas. Así se sabe cuánto generó cada profesional, que es la base de las comisiones (sección 3). Topes: hasta 20 servicios y $20.000.000 por atención; más que eso es un error de carga, o dos atenciones.

**Al llegar, se precarga lo reservado.** Si la cita tiene servicio y profesional, la atención nace con esa línea. Si falta el profesional, el editor la propone y alguien lo elige. Un "Llegó" marcado por error se deshace mientras la persona está en espera, y la reserva vuelve a su columna.

**El dueño también atiende.** El dueño no es miembro del equipo, así que sus líneas se marcan aparte como suyas y no generan comisión. Si quien hizo una línea deja el equipo, la línea conserva su nombre en el historial. Si todavía no se cobró, alguien tiene que reasignarla antes de cobrar.

**Pago dividido.** Medios fijos: efectivo, tarjeta de débito, tarjeta de crédito, transferencia y billetera digital. Un cobro se puede repartir entre varios medios. La suma tiene que coincidir con el total al centavo: se calcula en centavos enteros, nunca con decimales sueltos.

**Lo cobrado no se reescribe.** Una vez finalizada, la atención no se edita. Si hubo un error, el dueño la anula, también días después desde Reportes: queda en el historial de anuladas (quién, cuándo y por qué) y deja de sumar. Si alguien se va sin ser atendido, también se anula.

**La agenda se entera sola.** Al empezar la atención de alguien con reserva, su cita pasa a "en progreso"; al cobrarla, a "completada". El precio de la cita no cambia: lo cobrado vive en la atención, y el total puede incluir servicios de otros profesionales que quien atendió la cita no debe ver. Una cita marcada como completada en la agenda sin pasar por el cobro **no suma ingresos**: no hay registro de cuánto se cobró ni cómo.

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

**Las cifras siguen al filtro.** Con un filtro de profesional o de servicio, los ingresos son la suma de los servicios que cumplen el filtro, no la atención entera: "Carla" muestra lo que generó Carla. Con un filtro de medio de pago, son lo que entró por ese medio. Un pago no se puede atribuir a un servicio, así que el desglose que no corresponde no se muestra; en la tabla, las líneas que cumplen el filtro se destacan.

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
| **Precio** | Monto de la suscripción, si los límites por plan se aplican en v1 y duración de la prueba gratuita (con o sin tarjeta). |
| **Funciones nuevas** | El resto del listado de ideas por incorporar, con qué problema resuelve cada una y si es imprescindible para vender. |
| **Comisiones en el tablero** | Integrar la rama `f-003-comisiones` sobre las líneas de atención (sección 3.6). |
| **Turnos y zona horaria** | Si cada negocio define sus propios turnos y su zona horaria, en vez de los turnos fijos y la hora del dispositivo (sección 8). |
| **Corregir un cobro** | Hoy lo cobrado se anula, también días después desde Reportes. Falta decidir si el dueño puede reabrirlo y corregirlo, y con qué registro. |
| **Roles** | Si hace falta un super administrador de la plataforma, y si el cliente final puede crear cuenta para ver su historial y reprogramar. |
| **Branding** | Nombre definitivo (mantener *Eli* o cambiar), dominio, y tono: cercano o sobrio. |
| **No funcionales** | Móvil primero (un barbero gestiona desde el teléfono); zonas horarias y país; sólo español o también inglés; política de privacidad y retención de datos de clientes. |
