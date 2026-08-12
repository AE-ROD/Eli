# Eli v1 — Levantamiento de requerimientos

> Documento vivo. Se responde y se va completando; es el insumo de `PRODUCTO.md` y del backlog.
> **Estado:** esperando respuestas a §3.

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

**Recomendación:** un solo rubro. Vender es mucho más fácil cuando el cliente siente que la herramienta fue hecha para él, y ampliar después es barato. Si hay acceso a barberías, es el nicho natural: el caso de comisiones 30/70 es exactamente su dolor.

**Respuesta:**
> _(pendiente)_

---

### 3.2 ⭐ Modelo de negocio

Los planes anteriores (12/29/59 USD) nunca tuvieron Stripe conectado ni límites aplicados: cualquier cuenta usaba todo gratis.

- ¿Suscripción mensual por negocio, comisión por reserva, freemium o híbrido?
- ¿Cuánto cobrar, y cuánto puede pagar el rubro elegido?
- ¿Los límites por plan se aplican de verdad en v1?
- ¿Prueba gratuita? ¿Cuántos días, con o sin tarjeta?

**Recomendación:** suscripción mensual por negocio. Con comisiones entre dueño y trabajador dentro del producto, es el modelo con menos fricción: no se le toca la caja al negocio.

**Respuesta:**
> _(pendiente)_

---

### 3.3 ⭐ Diferenciador

La pregunta más importante, y la única que no puedo responder yo.

- ¿Por qué alguien elegiría Eli en vez de Booksy, Fresha, Agenda Pro o un cuaderno?
- ¿Qué hace mal la competencia que nosotros podemos hacer bien?

Sin respuesta clara acá, el producto compite sólo por precio. Las comisiones por trabajador son un buen candidato: es un dolor real, concreto y mal resuelto por las herramientas genéricas.

**Respuesta:**
> _(pendiente)_

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

**Respuesta:**
> _(pendiente)_

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
| Nicho, modelo de negocio y diferenciador sin definir | 🔴 Bloquea producto y branding (§3.1–3.3) |
| Funciones nuevas desconocidas | 🔴 Bloquea el backlog (§3.4) |
| Carpeta de buenas prácticas no compartida | 🟡 Se puede avanzar y aplicarla después (§3.8) |
| Sólo existe base de datos de producción | 🟡 No bloquea la etapa de requerimientos |

**Camino más corto para desbloquear:** responder §3.1, §3.2, §3.3 y §3.4.
