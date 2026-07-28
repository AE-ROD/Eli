# Auditoría Eli — Primera Versión

> Auditoría de código real sobre la rama `primera-version`. Cada hallazgo cita archivo y línea.
> No se modificó código: este documento es el insumo para decidir el orden de trabajo.

**Fecha:** julio 2026
**Alcance:** mensaje y contenido de la landing, diseño visual, y arquitectura necesaria para las tres funciones nuevas (panel de administrador, panel de empleado, comisiones por servicio).

---

## Resumen ejecutivo

| Área | Estado | Severidad |
|------|--------|-----------|
| Mensaje / propuesta de valor | Vende funciones, no soluciones. Falta "quiénes somos". | 🟡 Media |
| Afirmaciones publicadas | Hay cifras y funciones anunciadas que no son verificables o no existen. | 🔴 **Alta — riesgo legal/reputacional** |
| Elementos rotos en producción | Formulario de contacto inerte, enlace a página inexistente, badge falso. | 🔴 Alta |
| Diseño visual | Sin jerarquía cromática; 8+ colores compitiendo. Inconsistencias de patrón. | 🟡 Media |
| Ortografía y vocabulario | Decenas de palabras sin tilde en una sección; vocabulario clínico aplicado a barberías. | 🟡 Media |
| Base para panel de roles | `admin` y `worker` son indistinguibles a nivel de permisos. | 🔴 **Bloqueante** |
| Base para panel de empleado | Las citas nunca se asignan a un trabajador. | 🔴 **Bloqueante** |
| Base para comisiones | No existe ningún modelo de comisión ni de liquidación. | 🔴 **Bloqueante** |

**Conclusión corta:** el producto está bien construido en aislamiento entre negocios y validación de datos, pero las tres funciones que querés agregar comparten una misma raíz faltante: **no existe el concepto de "a quién pertenece este trabajo"**. Sin eso, ni el panel del empleado ni las comisiones son implementables. Esa es la primera pieza a construir.

---

# 1. Mensaje y propuesta de valor

## 1.1 El sitio enumera funciones, no resuelve problemas

La sección principal de producto (`components/landing/what-is-section.tsx:6-55`) está titulada con **nombres de funciones**:

| Título actual | Qué comunica | Qué resuelve realmente |
|---------------|--------------|------------------------|
| "Calendario Visual" | una función | dejar de perder citas por descoordinación |
| "CRM de Clientes" | una función (y en jerga técnica) | recordar quién es cada cliente sin depender de la memoria |
| "Reportes y Métricas" | una función | saber si el negocio gana o pierde plata |
| "Chat Integrado" | una función | dejar de saltar entre WhatsApp, Instagram y la agenda |
| "Página Pública" | una función | recibir reservas mientras dormís o atendés |
| "Recordatorios" | una función | dejar de perder plata por gente que no aparece |

**Observación importante:** el sitio **ya tiene** buen copy orientado a resultado — pero está enterrado en la sección de precios (`precios-section.tsx:9-14`): *"2–4 horas/semana"*, *"Cero doble-reservas"*, *"Clientes que no faltan"*. Ese es exactamente el registro correcto, y está en el lugar donde menos gente llega. **Recomendación: ese bloque debería subir, y la sección de funciones debería adoptar ese tono.**

El hero (`hero-section.tsx:62-65`) sí está bien planteado: *"Simplifica tu agenda, enfócate en tu talento"* — habla del beneficio, no del software. Conservarlo.

## 1.2 No existe sección "Quiénes somos"

Mencionaste que tenemos información de quiénes somos. **En el código no existe.** Verificado:
- No hay componente de "sobre nosotros" en `components/landing/`.
- El footer enlaza "Sobre nosotros" a `href="#"` (`footer.tsx:14`) — enlace muerto.
- Lo más cercano es una línea en el footer: *"Simplificamos tu agenda para que tú te enfoques en tu talento"* (`footer.tsx:36`).

Para un SaaS que va a cobrar suscripciones a negocios pequeños, la ausencia de una cara humana detrás es una fricción de conversión real. **Hay que crearla desde cero, no mejorarla.**

## 1.3 Vocabulario: "Pacientes" no le sirve a una barbería

El producto apunta explícitamente a barberías, estudios de música, fotografía y tutorías (`target-section.tsx:7-64`), pero la interfaz les habla en lenguaje clínico:
- Menú lateral: **"Pacientes"** (`barra-lateral.tsx:27`)
- Vista previa del producto en la landing: pestaña **"Pacientes"** (`dashboard-preview-section.tsx:10`)
- La base de datos usa `Patient` / tabla `clientes` — o sea, el modelo ya dice "clientes", pero la UI dice "pacientes".

Un barbero, un fotógrafo o un profesor de guitarra no tiene "pacientes". Dado que trabajás por rubro, **el vocabulario debería adaptarse al rubro elegido al crear la cuenta** (el campo `Business.type` ya existe y guarda esa información).

---

# 2. Afirmaciones publicadas — riesgo real

Esta sección es la más delicada porque son cosas que ya están publicadas y que un cliente podría reclamar.

## 2.1 Cifras de tracción no verificables

| Afirmación | Ubicación | Problema |
|------------|-----------|----------|
| "+1,200 negocios confían en Eli" | `hero-section.tsx:142` | El producto no está lanzado. Es una cifra inventada. |
| "Miles de profesionales ya dejaron de coordinar citas por WhatsApp" | `precios-section.tsx:107` | Misma situación. |
| 5 estrellas + 5 avatares de clientes | `hero-section.tsx:127-141` | Prueba social fabricada (`AVATARS` son letras hardcodeadas). |

**Riesgo:** publicidad engañosa. En una página que cobra con tarjeta, esto es exponerse innecesariamente. **Recomendación: quitarlas hasta tener números reales.** Un lanzamiento honesto ("sé de los primeros en usarlo") convierte bien y no te expone.

## 2.2 Funciones vendidas que no existen en el código

| Se vende | Dónde | Realidad en el código |
|----------|-------|----------------------|
| "Reportes exportables" (planes Equipo y Pro) | `precios-section.tsx:56,77` | **No existe ninguna función de exportación.** Búsqueda sin resultados. |
| "Reportes + estadísticas avanzadas" (plan Pro) | `precios-section.tsx:77` | Sólo existe `/api/dashboard/stats` con 4 métricas básicas. |
| Límites por plan ("1 profesional", "hasta 5 trabajadores") | `precios-section.tsx:29,49,70` | **No hay ninguna verificación de límites.** Cualquier cuenta puede invitar trabajadores ilimitados. |
| Chat con estado "En línea" | `dashboard-preview-section.tsx:186` | El chat no tiene presencia ni tiempo real. Es un mockup. |
| "Pagos seguros con Stripe" | `precios-section.tsx:256` | Stripe no está integrado (`provider-precios.tsx:32` tiene un `TODO`). |

**Riesgo:** cobrar por un plan cuyas funciones diferenciadoras no existen es motivo directo de reembolso y disputa de tarjeta. **Esto debe resolverse antes de activar cobros** — o quitando la función de la lista, o construyéndola.

## 2.3 Elementos rotos visibles al usuario

| Elemento | Ubicación | Estado |
|----------|-----------|--------|
| Formulario de contacto | `contact-section.tsx:93-154` | **No tiene `onSubmit`.** El botón "Enviar mensaje" no hace absolutamente nada. Los mensajes se pierden en silencio. |
| Enlace "Ayuda" del menú | `barra-lateral.tsx:33` → `/dashboard/ayuda` | **La página no existe.** Lleva a un 404. |
| Contador de chats | `barra-lateral.tsx:28` | `notificaciones: 3` está hardcodeado. Siempre muestra 3, incluso sin mensajes. |
| Email de contacto | `contact-section.tsx:13` | `hola@eli.app` — dominio placeholder. |
| Datos por defecto del usuario | `barra-lateral.tsx:52-56` | Si falla la sesión, muestra "María García / Salón María" — datos ficticios en producción. |

---

# 3. Auditoría de diseño

## 3.1 Sin jerarquía cromática: todo compite

El sistema de color asigna un color distinto por tarjeta, sin significado:
- `what-is-section.tsx`: azul, violeta, esmeralda, naranja, cian, rosa (6 colores)
- `target-section.tsx`: rosa, cian, naranja, violeta, pizarra, azul, rosa, esmeralda (8 colores)
- `precios-section.tsx`: azul, ámbar, rosa, violeta + verde para ahorros

**Problema:** cuando todo está resaltado, nada está resaltado. El color no comunica nada (no hay una lógica de "azul = agenda, verde = dinero"), es decoración aleatoria. Además compite con el azul de marca, que debería ser el único acento fuerte.

**Recomendación:** un solo acento (el azul de marca) + neutros, y reservar color semántico sólo para estados reales (éxito / alerta / peligro). Los íconos monocromos en azul, como hicimos en el flyer.

## 3.2 Inconsistencias de patrón

| Patrón | Dónde se cumple | Dónde se rompe |
|--------|-----------------|----------------|
| Eyebrow "línea + label + línea" | `what-is`, `how-it-works`, `target`, `precios`, `contact` | `dashboard-preview-section.tsx:232` usa un `<span>` suelto sin líneas |
| Título con acento en itálica serif | casi todas | `dashboard-preview-section.tsx:236` ("Una interfaz que amarás usar") no lo usa |

## 3.3 Copy genérico en la vista previa

`dashboard-preview-section.tsx:236-241`: *"Una interfaz que amarás usar / Diseñada para ser simple, profesional y eficiente."* — esto no dice nada específico; podría ser de cualquier producto. Es el lugar donde deberías demostrar el beneficio concreto.

## 3.4 La vista previa no coincide con el producto real

- Muestra un panel "Gráfico de citas por semana" (`dashboard-preview-section.tsx:83-85`) que **no existe** en el dashboard real.
- Muestra "Ingresos est. $2,450" con datos inventados.
- Muestra chat con indicador "En línea" que el producto no tiene.

Vender una interfaz que no es la que el usuario va a recibir genera decepción en el primer login.

## 3.5 Ortografía — sección completa sin tildes

`target-section.tsx` tiene errores sistemáticos en texto visible al público:

| Actual | Correcto |
|--------|----------|
| "Salon de belleza, barberia" | Salón, barbería |
| "centro de **unas**" | centro de **uñas** ← cambia el significado por completo |
| "Agenda multiple por estilista" | múltiple |
| "Historial clinico basico" | clínico básico |
| "Estudios de Musica" | Música |
| "Fotografia", "videoasta" | Fotografía, **videasta** |
| "Tutoria escolar" | Tutoría |
| "ceramica", "holistica" | cerámica, holística |
| "Gestion de talleres" | Gestión |
| "Profesionaliza tu operacion" | operación |

Son ~15 errores en una sola sección. En un producto que se vende como "profesional", esto contradice el mensaje.

---

# 4. Arquitectura: qué falta para las funciones nuevas

Esta es la parte crítica. Las tres funciones que pediste dependen de piezas que **no existen todavía**.

## 4.1 🔴 BLOQUEANTE: `admin` y `worker` son el mismo rol

**Hallazgo:** el único control de permisos en toda la aplicación es `role === "owner"`.

- `app/api/equipo/route.ts:12,41` — única verificación de rol del backend.
- `app/dashboard/layout.tsx:25` y `barra-lateral.tsx:114` — muestran/ocultan el menú "Equipo".
- `listaEquipo.tsx:8-15` — el rol `admin` **sólo cambia una etiqueta de color y texto**.

**Consecuencia:** hoy un `admin` no puede hacer nada que un `worker` no pueda. La distinción es puramente cosmética. Para que "el administrador gestione roles del equipo" hay que construir el sistema de permisos, no ajustarlo.

**Además:** `/api/equipo` es exclusivo del `owner`. Un `admin` **no puede** acceder a la gestión de equipo. Lo que pediste requiere cambiar esa regla.

**Falta también:** no existe endpoint para *cambiar* el rol de un miembro ni para eliminarlo. Sólo existe crear invitación (`POST /api/equipo`). No hay `PATCH` ni `DELETE` de miembro.

## 4.2 🔴 BLOQUEANTE: las citas no se asignan a nadie

**Hallazgo:** el campo `Appointment.memberId` existe en el esquema (`prisma/schema.prisma`), pero **nunca se escribe**.

Verificado: búsqueda de `memberId` en `app/api/citas/` y `app/api/reservar/` → **0 coincidencias**.

Esto significa:
- Al crear una cita desde el dashboard, no se registra qué trabajador la atiende.
- Al reservar desde la página pública, el cliente **no puede elegir profesional** y la cita queda sin dueño.

**Consecuencia doble:**
1. "El empleado ve su agenda" es **imposible** hoy — no hay forma de saber qué citas son suyas.
2. Las comisiones son **imposibles** — no se puede calcular el porcentaje de alguien sobre trabajos que no están asociados a esa persona.

**Contradicción notable:** los horarios **sí** se configuran por trabajador (`workSchedule.memberId` funciona correctamente, `configuracion/horarios/route.ts`), pero después el sistema no usa esa información para asignar citas. Se configura algo que no se aplica.

## 4.3 🔴 BLOQUEANTE: no hay aislamiento de datos por trabajador

Todos los endpoints filtran sólo por negocio (`businessId`), nunca por trabajador:

| Endpoint | Filtro actual | Qué ve un trabajador hoy |
|----------|---------------|--------------------------|
| `GET /api/citas` (`citas/route.ts:44`) | sólo `businessId` | la agenda completa del negocio |
| `GET /api/pacientes` (`pacientes/route.ts:28`) | sólo `businessId` | todos los clientes |
| `GET /api/dashboard/stats` | sólo `businessId` | **los ingresos totales del negocio** |
| `GET /api/chats` (`chats/route.ts:14`) | sólo `businessId` | todas las conversaciones |

**Especialmente sensible:** un empleado ve hoy la facturación completa del local. En un modelo de comisiones, eso es información que normalmente el dueño no comparte.

**La excepción bien hecha:** `configuracion/horarios/route.ts:8-20` tiene una función `resolverMemberId()` que **sí** implementa correctamente el aislamiento (un worker sólo toca su propio horario, y valida que el miembro pertenezca al negocio). **Ese es el patrón a replicar** en el resto de endpoints.

## 4.4 🔴 No existe modelo de comisiones

No hay absolutamente nada de esto en el esquema. Lo que existe hoy:
- `Service.price` — precio de lista del servicio.
- `Appointment.price` — precio de la cita.

Lo que falta para tu caso de la barbería (30% local / 70% barbero):

**Decisiones de diseño que necesito que definas** (afectan el esquema, y cambiarlo después es caro):

1. **¿A qué nivel se define el porcentaje?**
   - a) Por trabajador (ej. "Juan se lleva 70% de todo") — simple, cubre la mayoría de barberías.
   - b) Por servicio (ej. "todo corte reparte 70/30") — el ejemplo que diste.
   - c) Por trabajador × servicio (ej. "Juan 70% en corte, 50% en color") — más flexible, más complejo.
   - **Mi recomendación:** implementar (a) como base con posibilidad de excepción por (c). Cubre el caso real sin sobre-construir.

2. **Histórico de porcentajes — CRÍTICO.** Si el admin cambia el porcentaje de Juan de 70% a 60% hoy, **las citas ya cobradas del mes pasado deben conservar el 70%**. Si no se guarda el porcentaje *en el momento de la cita*, cada cambio recalcula liquidaciones ya pagadas y descuadra las cuentas. Este es el error clásico en sistemas de comisiones y es muy caro de arreglar después.
   - **Solución:** guardar en la cita el porcentaje y el monto calculado al momento de completarla, no leerlo dinámicamente.

3. **¿Cuándo se "congela" la comisión?** Propuesta: cuando la cita pasa a estado `completada`. Ahí se toma el precio real cobrado, se aplica el porcentaje vigente, y se guarda el resultado.

4. **¿Sobre qué monto se calcula?** ¿Sobre el precio total, o descontando insumos/materiales primero? (En peluquería el tinte suele descontarse antes de repartir.)

## 4.5 La reserva pública no permite elegir profesional

`app/api/reservar/[slug]/` y sus componentes no ofrecen selector de profesional. Los slots se calculan contra el horario **del negocio**, no del trabajador (`slots/route.ts:65-68` busca `workSchedule` sin filtrar por miembro).

Para un negocio con equipo (que es el público de los planes Equipo y Pro), esto es una carencia funcional grande: el cliente no puede pedir "con Juan".

---

# 5. Qué recomiendo agregar además (documentación y arquitectura)

Me pediste sugerencias. Estas son las que creo que realmente valen para esta versión:

## 5.1 Documentos que faltan y sí importan

| Documento | Por qué |
|-----------|---------|
| `docs/PERMISOS.md` | **El más importante.** Una matriz única de "qué puede hacer cada rol" (owner / admin / worker) sobre cada recurso. Hoy la lógica está dispersa y por eso `admin` quedó vacío. Debe ser la fuente de verdad antes de escribir código. |
| `docs/MODELO-DATOS.md` | Diagrama y explicación de las entidades, sobre todo la relación miembro↔cita↔comisión que vamos a crear. |
| `docs/DECISIONES.md` | Registro corto de decisiones (ADR): qué se decidió, cuándo, y por qué. Evita rediscutir lo mismo en tres semanas. |
| `CLAUDE.md` | Contexto del proyecto para futuras sesiones de trabajo: convenciones, comandos, patrones a seguir. Evita que se reintroduzcan los errores ya corregidos. |
| `docs/GLOSARIO.md` | Vocabulario por rubro (cliente/paciente/alumno) para que la interfaz sea coherente. |

## 5.2 Arquitectura que recomiendo antes de codificar

1. **Un único módulo de autorización** (`lib/permisos.ts`) con funciones tipo `puedeGestionarEquipo(sesión)`, `puedeVerIngresos(sesión)`. Hoy cada endpoint improvisa su chequeo — así fue como `admin` quedó sin permisos. Centralizarlo hace que agregar un rol sea cambiar un archivo, no veinte.

2. **Auditoría de cambios sensibles.** Cuando alguien cambia el porcentaje de comisión de un trabajador, debe quedar registro de quién, cuándo y de qué valor a qué valor. Es dinero: sin registro, cualquier disputa entre dueño y empleado es imposible de resolver.

3. **Tests de permisos.** Ya existe Vitest configurado. Cada regla de permiso debería tener un test que verifique que un `worker` NO puede hacer lo que sólo el `admin` puede. Sin esto, cualquier refactor futuro puede abrir una fuga sin que nadie se entere.

4. **Base de datos de desarrollo.** Hoy la única base que existe es la de producción en Neon. Eso hace imposible probar de verdad (como vimos al intentar el test de multi-tenancy). Necesitamos un entorno local o una rama de base de datos separada antes de tocar el modelo de comisiones.

---

# 6. Orden de trabajo propuesto

El orden importa: cada bloque depende del anterior.

**Bloque 0 — Cimientos** (sin esto nada más funciona)
1. Módulo central de permisos + matriz de roles documentada.
2. Asignación de citas a trabajador (`memberId` al crear cita y al reservar).

**Bloque 1 — Panel de administrador**
3. Cambiar rol de un miembro / quitar miembro.
4. Dar acceso al `admin` (hoy sólo `owner`).

**Bloque 2 — Panel de empleado**
5. Vista "Mi agenda" con sus citas del día.
6. Filtrado real por trabajador en los endpoints.

**Bloque 3 — Comisiones**
7. Modelo de datos con histórico.
8. Configuración de porcentajes por el admin.
9. Vista de liquidación (admin ve todo; trabajador ve lo suyo).

**Bloque 4 — Contenido y diseño**
10. Quitar afirmaciones no verificables y funciones inexistentes.
11. Arreglar elementos rotos (formulario, /ayuda, badge).
12. Reescritura orientada a solución + sección "Quiénes somos".
13. Unificación cromática y corrección ortográfica.

> **Nota sobre el bloque 4:** los puntos 10 y 11 son de bajo esfuerzo y alto riesgo si no se hacen. Podrían adelantarse a cualquier momento, incluso antes del bloque 0.

---

## Preguntas abiertas que necesito que respondas

Antes de empezar el desarrollo, estas decisiones cambian el diseño del código:

1. **Comisiones:** ¿el porcentaje va por trabajador, por servicio, o por combinación? (ver 4.4)
2. **Comisiones:** ¿se calcula sobre el precio total o se descuentan insumos primero?
3. **Visibilidad del empleado:** ¿el trabajador debe ver *sólo* sus citas, o la agenda completa del local? (En muchas barberías todos ven todo a propósito.)
4. **Ingresos:** ¿el trabajador puede ver cuánto factura el negocio, o sólo lo que le corresponde a él?
5. **Rol admin:** ¿un `admin` puede modificar porcentajes de comisión, o eso queda reservado al `owner` (dueño)?
