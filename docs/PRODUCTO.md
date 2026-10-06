# Eli — Definición de producto

> Fuente de verdad de qué construimos y por qué. Lo que todavía no está
> decidido vive en la sección 8, no en documentos aparte.

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
| 3 | Sin configurar | La cita queda **pendiente de configurar** |

**El caso 3 nunca asume cero en silencio.** Una comisión sin configurar es un error de configuración, no una comisión de $0. Se muestra como pendiente y se le avisa al dueño; si no, se liquida de menos sin que nadie lo note.

**Por qué con herencia:** el dueño configura un porcentaje por persona y listo. Sólo define excepciones donde realmente las hay. No tiene que llenar una matriz de todos los profesionales por todos los servicios el primer día.

### 3.2 Base de cálculo

Sobre el **precio total** de la cita, sin descontar insumos.

> ⚠️ **Riesgo asumido y documentado.** No contempla descontar materiales antes de repartir (relevante donde hay insumos caros, como tintura). Si aparece esa necesidad, agregarla implicará migrar datos ya cargados. Se acepta el riesgo para v1.

### 3.3 Congelado — la regla que no se negocia

**Al pasar la cita a `completada`, el porcentaje y el monto se guardan en la cita.** No se recalculan nunca más.

Si el dueño le cambia el porcentaje a Juan hoy, **las citas de los meses anteriores conservan el porcentaje que tenían.** Sin esto, cada ajuste reescribe liquidaciones ya pagadas y las cuentas dejan de cerrar. Es el error clásico de los sistemas de comisiones y es carísimo de reparar una vez que hay datos.

### 3.4 Quién puede tocar qué

| | Configurar porcentajes | Ver liquidación de todos | Ver la propia |
|---|---|---|---|
| **Dueño** | ✅ | ✅ | — |
| **Encargado** | ❌ | ✅ | — |
| **Profesional** | ❌ | ❌ | ✅ |

El encargado gestiona la operación: equipo, agenda, horarios. **No toca dinero.** Se puede abrir después; cerrarlo después es incómodo.

### 3.5 Auditoría

Todo cambio de porcentaje deja registro: **quién, cuándo, de qué valor a qué valor.** Es dinero — sin historial, una discusión entre dueño y profesional no se puede resolver.

### 3.6 Modelo de datos

```
BusinessMember.commissionPercent   Float?   → porcentaje por defecto del profesional
CommissionRate (memberId, serviceId, percent) → excepción puntual
Appointment.commissionPercent/Amount/At       → congelado al completar
CommissionChange (quién, cuándo, antes, después) → auditoría
```

---

## 4. Modelo de negocio

**Suscripción mensual por negocio.**

No se cobra comisión sobre las reservas. Eli **administra** el dinero del negocio, no lo toca. Cobrarle un porcentaje a quien usa Eli justamente para repartir porcentajes sería contradictorio, y además obligaría a procesar pagos de terceros.

Precio, límites por plan y prueba gratuita: pendientes (sección 8).

**Regla firme:** no se vende ninguna función que no exista. La versión anterior listaba "reportes exportables" en planes pagos sin haberlos construido — eso es motivo directo de reembolso.

---

## 5. Roles

| Rol | Alcance |
|---|---|
| **Dueño** | Todo, incluidos los porcentajes de comisión |
| **Encargado** | Equipo, agenda, horarios y clientes. Sin acceso a configuración de comisiones |
| **Profesional** | Su agenda, sus clientes atendidos y su propia liquidación |
| **Cliente final** | Reserva desde la página pública, sin cuenta |

El profesional **no ve la facturación del negocio**, sólo lo suyo. Con comisiones de por medio, cuánto factura el local es información del dueño.

---

## 6. Alcance de v1

**Entra:**
- Reservas, agenda y clientes
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

## 7. Branding — dirección propuesta

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

## 8. Pendiente de definir

Nada de esto bloquea el trabajo actual, pero cada punto se decide antes de construir lo que depende de él.

| Tema | Qué falta decidir |
|---|---|
| **Precio** | Monto de la suscripción, si los límites por plan se aplican en v1 y duración de la prueba gratuita (con o sin tarjeta). |
| **Funciones nuevas** | El resto del listado de ideas por incorporar, con qué problema resuelve cada una y si es imprescindible para vender. |
| **Atención sin reserva** | Las barberías atienden mucho sin cita previa. Hay que decidir si v1 registra al cliente que llega sin reservar (y su comisión). |
| **Roles** | Si hace falta un super administrador de la plataforma, y si el cliente final puede crear cuenta para ver su historial y reprogramar. |
| **Branding** | Nombre definitivo (mantener *Eli* o cambiar), dominio, y tono: cercano o sobrio. |
| **No funcionales** | Móvil primero (un barbero gestiona desde el teléfono); zonas horarias y país; sólo español o también inglés; política de privacidad y retención de datos de clientes. |
