# Eli v1 — Levantamiento de requerimientos

> Documento vivo. Se responde y se va completando; es el insumo de `PRODUCTO.md` y del backlog.
> **Estado:** cerradas todas las definiciones bloqueantes. Producto redactado en `PRODUCTO.md`.
> Pendientes menores: precio (§3.2), resto de funciones nuevas (§3.4), branding (§3.6) y convenciones (§3.8).

---

## Contexto

Eli es un sistema de reservas para negocios de servicios, ya desplegado y funcionando. La rama `v1` redefine **producto, branding y funciones desde cero**, conservando lo que ya está resuelto y es caro de rehacer.

No es una reescritura: la auditoría de la versión anterior mostró que las partes difíciles (aislamiento entre negocios, modelo de datos, autenticación) están bien construidas. Lo que falla es el producto encima de ellas.

---

## 1. Qué se conserva (decidido)

| Se conserva | Motivo |
|---|---|
| `prisma/schema.prisma` + sus 3 migraciones | **Ya aplicadas en la base de producción de Neon.** Rehacerlas obliga a migrar una base con datos. |
| `lib/auth.ts` — NextAuth con credenciales + Google | Autenticación funcionando, incluida la recuperación de contraseña. |
| Aislamiento multi-negocio de los endpoints | Auditado: sólido y consistente en las 21 rutas. Es el error más caro de un SaaS multi-tenant. |
| `lib/email.ts`, `lib/validaciones.ts`, `lib/slug.ts` | Piezas cerradas y con tests. |

**Se rehace libremente:** estructura de carpetas, componentes, landing, sistema de diseño y modelo de producto.

---

## 2. Evaluación del stack desplegado

| Pieza | Versión | Decisión |
|---|---|---|
| Next.js | 16.2.0 | Mantener — es la versión actual |
| React | 19.2.4 | Mantener |
| Prisma + Neon (Postgres) | 6.19 | Mantener — migraciones ya aplicadas |
| NextAuth | 4.24 | Mantener en v1. Auth.js v5 existe, pero migrar ahora rompe lo que funciona sin aportar valor |
| Tailwind | 4 | Mantener |
| Vercel + cron (`0 9 * * *`) | — | Mantener. **Ojo:** el plan Hobby prohíbe uso comercial; al cobrar hay que pasar a Pro (~20 USD/mes) o mover a Railway/Render |
| Resend | 6.12 | Mantener. Falta verificar el dominio (SPF/DKIM) o los correos caen en spam |
| Upstash (rate limiting) | — | **Reconstruir.** El código se perdió y falta crear la cuenta |
| Stripe | — | **No integrado.** Depende de §3.2 |
| Dependencias totales | 58 | **Auditar.** El proyecto nació en v0 y probablemente arrastra shadcn completo sin usar |

**Conclusión:** el stack no es el problema y no justifica cambiarlo.

---

## 3. Requerimientos a definir

> ⭐ = condiciona todo lo demás.

### 3.1 ⭐ Nicho y mercado

La versión anterior apuntaba a barberías, consultorios médicos, gimnasios, estudios de música, fotógrafos, tutores y estética **a la vez**. Eso obliga al producto a hablar siete idiomas y a no ser el mejor en ninguno — por eso la interfaz le decía "Pacientes" a un barbero.

- ¿A qué rubro le vendemos en v1: uno solo, dos o tres cercanos, o genérico?
- ¿En qué país o países? Define moneda, impuestos, formato de fecha y medio de pago.
- ¿Hay algún cliente real o potencial concreto hoy? Aunque sea uno.

**Recomendación original:** un solo rubro, para no hablar siete idiomas a la vez.

**Respuesta (decidida):** **no se segmenta por rubro, pero se elimina toda enumeración de rubros.**

El producto sigue sirviendo a cualquier negocio que trabaje con reservas, pero el mensaje deja de listar barberías, consultorios, gimnasios, etc. Listar rubros genera dos problemas: quien no aparece siente que el producto no es para él, y quien aparece último siente que es de segunda.

**El posicionamiento pasa a ser el comportamiento compartido, no el rubro:**
> *Si tu negocio trabaja con reservas, este sistema es para ti.*

**Consecuencias de diseño:**
- **Vocabulario único y neutro: "Clientes".** Se descarta adaptar el término por rubro (paciente/alumno). Si el mensaje no segmenta, la interfaz tampoco debe hacerlo. Esto además simplifica el producto: un solo término en toda la aplicación.
- Nada de íconos, ejemplos ni imágenes atados a un rubro específico en la landing.
- El campo `Business.type` deja de usarse para cambiar la interfaz. Se conserva sólo como dato interno de segmentación.

**Riesgo asumido y a vigilar:** un mensaje universal no elimina que los rubros operen distinto (una barbería atiende sin cita previa, un consultorio necesita historial, un gimnasio maneja cupos grupales). El posicionamiento puede ser universal; el producto igual va a tener que elegir qué flujos soporta. Si aparece un flujo que sólo sirve a un rubro, se evalúa aparte.

---

### 3.2 ⭐ Modelo de negocio

Los planes anteriores (12/29/59 USD) nunca tuvieron Stripe conectado ni límites aplicados: cualquier cuenta usaba todo gratis.

- ¿Suscripción mensual por negocio, comisión por reserva, freemium o híbrido?
- ¿Cuánto cobrar, y cuánto puede pagar el rubro elegido?
- ¿Los límites por plan se aplican de verdad en v1?
- ¿Prueba gratuita? ¿Cuántos días, con o sin tarjeta?

**Respuesta (decidida): suscripción mensual por negocio.**

No se cobra comisión sobre las reservas: el producto administra el dinero del negocio, no lo toca. Cobrarle un porcentaje a quien usa Eli justamente para repartir porcentajes sería contradictorio.

**Pendiente de definir (no bloquea el diseño):** precio, si los límites por plan se aplican en v1, y duración de la prueba gratuita.

---

### 3.3 ⭐ Diferenciador

La pregunta más importante, y la única que no puedo responder yo.

- ¿Por qué alguien elegiría Eli en vez de Booksy, Fresha, Agenda Pro o un cuaderno?
- ¿Qué hace mal la competencia que nosotros podemos hacer bien?

**Respuesta (decidida): la gestión de comisiones por servicio prestado.**

Muchos negocios que trabajan con reservas comparten un mismo modelo: el profesional que atiende se lleva un porcentaje del monto del servicio y el negocio retiene el resto. Es una operación que hoy se resuelve con planillas, calculadora o memoria, y que las herramientas de reservas genéricas no cubren.

**Por qué funciona como diferenciador:**
- Es un dolor **económico**, no organizativo. Duele todos los meses y se puede medir en dinero.
- Es **transversal a los rubros**, lo que encaja con la decisión de §3.1: no hay que elegir vertical para resolverlo.
- Booksy, Fresha, Calendly y Agenda Pro compiten en agendar. Ninguna resuelve bien el reparto entre negocio y profesional.

**Implicancia:** las comisiones dejan de ser "una función más" y pasan a ser **el centro del producto**. Eso eleva el estándar: no alcanza con configurar un porcentaje, hay que resolver el ciclo completo — configurar, calcular, liquidar y poder auditar.

---

### 3.4 ⭐ Funciones nuevas

Hay ideas nuevas por incorporar y son el insumo principal del backlog.

- ¿Cuáles son? Por cada una: qué problema resuelve y a quién.
- ¿Cuáles son imprescindibles para vender y cuáles pueden esperar?

**Ya definidas en la etapa anterior — confirmar si siguen vigentes:**

| Función | Reglas ya decididas |
|---|---|
| Panel de administrador | Gestiona roles del equipo, altas y bajas |
| Panel de empleado | Su agenda del día y sus trabajos pendientes |
| Comisiones por trabajador | Por trabajador (no por servicio), sobre el precio total, **sólo el dueño las modifica**. El porcentaje se congela en la cita al completarse: cambiarlo hoy no debe recalcular liquidaciones ya pagadas |
| Elegir profesional al reservar | Hoy no se puede, aunque los horarios ya son por trabajador |

**Respuesta (parcial):** la función central es la **vista de administración de comisiones**: el administrador configura el porcentaje de ganancia que recibe cada profesional **según el servicio**.

⚠️ **Esto modifica una decisión anterior.** En la etapa previa se había definido el porcentaje **por trabajador** (un único porcentaje que aplica a todo lo que hace esa persona). Lo planteado ahora incorpora el **servicio** a la ecuación. Hay que precisar cuál de estos tres modelos es (ver §3.9), porque define el esquema de base de datos y cambiarlo después obliga a migrar datos ya cargados.

**Reglas que se mantienen de la etapa anterior:**

| Regla | Detalle |
|---|---|
| Sólo el dueño modifica porcentajes | El encargado gestiona equipo y agenda, pero no toca dinero |
| Se calcula sobre el precio total | Sin descontar insumos. Riesgo asumido: si entran negocios con materiales caros (tintura), habrá que revisarlo |
| El porcentaje se congela en la cita | Al pasar a `completada` se guarda el valor aplicado. Cambiar un porcentaje hoy **no** debe recalcular liquidaciones ya pagadas |
| Historial de cambios | Quién cambió qué y cuándo. Es dinero: sin registro, una disputa entre dueño y profesional no se puede resolver |

**Aún pendiente:** el resto de ideas nuevas por incorporar.

---

### 3.9 ⭐ Granularidad de la comisión (nuevo — bloqueante)

Define el esquema de datos. Tres modelos posibles:

| Modelo | Ejemplo | Costo |
|---|---|---|
| **A. Por profesional** | "Juan se lleva el 70% de todo lo que hace" | Simple. Un valor por persona |
| **B. Por servicio** | "Todo corte reparte 70/30, sin importar quién lo haga" | Simple. Un valor por servicio |
| **C. Por profesional × servicio** | "Juan 70% en corte y 50% en color; Pedro 60% en corte" | Matriz. Más potente y más trabajo de configuración |

**Respuesta (decidida): C con herencia.**

Cada profesional tiene un porcentaje por defecto; se puede sobrescribir para servicios puntuales. Resolución en cascada:

1. ¿Existe un porcentaje definido para *ese profesional* en *ese servicio*? → se usa ese.
2. Si no, ¿el profesional tiene un porcentaje por defecto? → se usa ese.
3. Si no hay ninguno → la cita queda sin comisión, y se muestra como pendiente de configurar (no se asume cero en silencio).

Detalle en `PRODUCTO.md`.

---

### 3.5 Usuarios y roles

Confirmado para v1: **dueño > encargado > trabajador**, más el **cliente final** que reserva sin cuenta.

- ¿Hace falta un super administrador de la plataforma (ver todos los negocios)? Hoy no existe.
- ¿El cliente final debería poder crear cuenta para ver su historial y reprogramar, o sigue reservando como invitado?

**Respuesta:**
> _(pendiente)_

---

### 3.6 Branding

- ¿Se mantiene el nombre **Eli** o cambia?
- ¿Hay dominio comprado?
- Tono: ¿cercano y coloquial, o profesional y sobrio?
- Misión ya definida: *centralizar la información, eliminar el trabajo engorroso y construir soluciones donde hoy sólo hay problemas.* ¿Sigue vigente?

Si el nicho no está cerrado, conviene definir el branding **después**: el nombre y la identidad se derivan de a quién le hablás.

**Respuesta:**
> _(pendiente)_

---

### 3.7 No funcionales

- ¿Móvil primero? Un barbero gestiona desde el teléfono, no desde un escritorio.
- ¿Zonas horarias? Relevante si hay más de un país.
- ¿Sólo español, o también inglés?
- ¿Requisitos legales por datos de clientes (política de privacidad, retención)?

**Respuesta:**
> _(pendiente)_

---

### 3.8 Convenciones de trabajo

Existe una carpeta con buenas prácticas que todavía no fue compartida. Es insumo directo de la estructura de esta rama.

- ¿Dónde está? ¿Se sube al repositorio o se pega su contenido?
- ¿Es convención de carpetas, linter, guía de estilo, o las tres?

**Respuesta:**
> _(pendiente)_

---

## 4. Estructura documental de la rama

Mínima y orientada al trabajo, aprendiendo del exceso de documentos de la etapa anterior:

```
CLAUDE.md                 cómo trabajar: convenciones, comandos, reglas
docs/REQUERIMIENTOS.md    este documento
docs/PRODUCTO.md          nicho, modelo de negocio, diferenciador, branding
docs/FEATURES.md          backlog, con las reglas decididas dentro de cada feature
.claude/settings.json     permisos de desarrollo
```

Las decisiones se anotan **dentro de la feature que las usa**, no en archivos aparte.

---

## 5. Reglas de trabajo

- **Commitear al cerrar cada etapa, no al final de la sesión.** El contenedor es efímero y ya se perdió un día de trabajo por acumular cambios sin guardar.
- Antes de cerrar cualquier etapa con código: `npm run lint`, `npx tsc --noEmit` y `npm test` en verde.
- No ejecutar operaciones destructivas contra la base: la única configurada es **producción**.

---

## 6. Estado de bloqueantes

| Bloqueante | Estado |
|---|---|
| `git commit` denegado por configuración | ✅ Resuelto — la configuración desapareció con el reseteo del contenedor y no se vuelve a introducir |
| Nicho | ✅ Resuelto — sin segmentar por rubro, mensaje sobre el comportamiento compartido (§3.1) |
| Diferenciador | ✅ Resuelto — gestión de comisiones por servicio prestado (§3.3) |
| Granularidad de la comisión | ✅ Resuelto — profesional × servicio con herencia (§3.9) |
| Modelo de negocio | ✅ Resuelto — suscripción mensual por negocio (§3.2). Falta definir precio |
| Resto de funciones nuevas | 🟡 Falta el resto del listado (§3.4) |
| Carpeta de buenas prácticas no compartida | 🟡 Se puede avanzar y aplicarla después (§3.8) |
| Sólo existe base de datos de producción | 🟡 No bloquea la etapa de requerimientos |

**Siguiente paso:** con el producto definido, redactar el backlog en `FEATURES.md` y la identidad en la sección de branding.
