---
id: F-007
titulo: Credibilidad — fuera los datos inventados
estado: en-progreso
prioridad: alta
areas: [frontend]
rama: v1
estimacion: chica
max_iteraciones: 3
---

# F-007 — Credibilidad: fuera los datos inventados

## Problema

El producto afirma cosas que no son ciertas. Con un cliente real delante, cada
una es una forma de perder la venta en el momento exacto en que la estabas
ganando.

Encontrado al correr el sistema:

1. **`components/landing/hero-section.tsx:142` — "+1,200 negocios confían en Eli"**,
   con cinco estrellas y una pila de avatares inventados. Son cero negocios. Es
   la peor: es verificable y es lo primero que ve alguien que llega.
2. **`components/app/layout/barra-lateral.tsx:28` — el badge de Chats está fijo
   en `notificaciones: 3`.** No cuenta nada: dice 3 aunque no haya ninguna
   conversación. En la demo aparecía un "3" al lado de Chats con la bandeja
   vacía.
3. **`barra-lateral.tsx:54-58` — `usuarioDefault`: "María García / Salón María".**
   Si la sesión no carga, la interfaz inventa un usuario y un negocio en vez de
   admitir que no sabe quién sos.

El eslogan es que trabajamos con el recurso más valioso, el tiempo. Una cifra
inflada dice lo contrario: que preferimos el atajo.

## Alcance

**Incluye:**
- Sacar la prueba social falsa del hero y poner en su lugar algo verdadero.
- Que el badge de Chats cuente conversaciones reales, o no exista.
- Que la barra lateral no invente un usuario cuando no hay sesión.

**NO incluye:**
- **`app/dashboard/page.tsx`**: lo está tocando F-006 ahora mismo. No entrar ahí.
- El rediseño visual del dashboard: es la etapa siguiente, con F-006 ya cerrada.
- `components/landing/dashboard-preview-section.tsx`: los datos de esa maqueta
  son una ilustración del producto, no un testimonio. Se deja, pero **no puede
  parecer el negocio de un cliente real**; si hace falta, se aclara que es un
  ejemplo.
- Las tendencias del dashboard (`+0% vs mes anterior`) **no son inventadas**:
  salen de `stats.tendencias`, calculado contra el mes anterior. Se quedan.

## Criterios de aceptación

- [ ] No queda ninguna cifra de adopción, testimonio, reseña ni valoración que
      no sea verificable. Buscar en toda la landing, no sólo en el hero.
- [ ] Lo que reemplace a la cifra dice algo cierto y concreto sobre el producto.
      Nada de rellenar el hueco con otra afirmación vaga.
- [ ] El badge de Chats refleja conversaciones reales; si eso no se puede
      resolver sin backend nuevo, **no se muestra ningún número**.
- [ ] Sin sesión, la barra lateral no muestra un nombre ni un negocio inventado.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Tareas por área

| # | Área | Tarea | Agente | Estado | Depende de |
|---|---|---|---|---|---|
| 1 | frontend | Sacar los tres datos inventados | frontend | completada | — |
| 2 | qa | Barrer la landing y el panel buscando los que queden | qa | rechazada (5 hallazgos reales) | 1 |
| 3 | frontend | Corregir los 5 hallazgos de QA + segundo barrido | frontend | completada | 2 |

## Contexto técnico

- `components/landing/hero-section.tsx` — la línea 142 y la pila de avatares y
  estrellas alrededor.
- `components/app/layout/barra-lateral.tsx` — `notificaciones: 3` en la lista de
  ítems, y `usuarioDefault`.
- El badge sale de un array estático de navegación; no hay endpoint que cuente
  conversaciones sin leer. Existe `GET /api/chats`, pero conviene mirar qué
  devuelve antes de decidir si alcanza.
- La barra lateral ya recibe `usuario` como prop desde `app/dashboard/layout.tsx`,
  armado con la sesión del servidor.

## Fuera de alcance detectado

- **`precios-section.tsx:107`** — "Miles de profesionales ya dejaron de coordinar
  citas por WhatsApp" es otra cifra de adopción falsa (cero clientes hoy). Está
  fuera de la tarea #1 tal como está escrita (el contexto técnico sólo menciona
  hero y barra lateral), pero cae dentro del criterio de aceptación "buscar en
  toda la landing" y del mismo patrón de la ficha, así que la corregí en el
  mismo barrido: pasó a "Dejá de coordinar citas por WhatsApp. Empieza gratis 3
  días, sin tarjeta." — sin afirmar tracción.
- **Badge de "Ahorra hasta 32%" en `precios-section.tsx`**: lo revisé porque
  parece una cifra de marketing, pero es un cálculo real hecho a partir de los
  precios definidos en el propio archivo (`(mensual*12 - anual) / (mensual*12)`,
  máximo en el plan Pro: 229/708 ≈ 32%). No es un dato inventado y tocar precios
  no es parte de esta tarea, así que se deja igual.
- **Badge de Chats sin número**: contar conversaciones reales (o no leídas)
  requeriría backend nuevo. El modelo `Message` no tiene un campo de "leído"
  (`prisma/schema.prisma`, `model Message`), así que no hay forma de calcular
  "no leídos" hoy. `GET /api/chats` sólo devuelve la lista de conversaciones, no
  un conteo de pendientes. Si el producto quiere un badge real, hace falta:
  (a) decidir qué cuenta (conversaciones totales vs. mensajes sin leer) y
  (b) si es lo segundo, agregar el campo `read`/`readAt` al modelo `Message` y
  el endpoint o cómputo correspondiente. Por ahora el ítem de Chats no muestra
  ningún número.
- No toqué `app/dashboard/page.tsx` ni `components/landing/dashboard-preview-section.tsx`
  (la maqueta usa "Mi Negocio" y nombres de ejemplo genéricos tipo "María G.",
  "Carlos R." en una vista de calendario ilustrativa — no se lee como el
  negocio de un cliente real, así que no ameritaba aclaración adicional).
- **`app/crear-cuenta/page.tsx:119`** — encontrado en el segundo barrido:
  "Únete a cientos de profesionales que ya confían en Eli" es la misma cifra de
  adopción falsa que ya se había sacado del hero, pero en la página de registro.
  No está en `components/landing/` ni en los modales de precios que pidió el
  segundo barrido, pero es el mismo patrón exacto que esta ficha existe para
  eliminar (cero negocios reales hoy), así que la corregí en el mismo barrido:
  pasó a "Configura tu negocio en minutos y deja que tus clientes reserven
  solos, sin llamadas ni WhatsApp." — cierto y verificable (`app/crear-cuenta/page.tsx`
  paso 2 configura el negocio, `app/reservar/[slug]/page.tsx` es la página
  pública real de reservas).
- **`components/app/modales/modal-precios.tsx:149`** (antes de esta corrección)
  tenía la misma frase "Miles de profesionales ya dejaron de coordinar citas
  por WhatsApp" que se había corregido en `precios-section.tsx` pero no en el
  modal — quedó igual de falsa ahí. Corregida con el mismo texto que ya se usa
  en `precios-section.tsx`.
- **`components/app/modales/provider-precios.tsx:32`** — el `// TODO: conectar
  con Stripe Checkout` sigue ahí. No es una afirmación visible para el usuario
  (es un comentario de código), así que no es un problema de credibilidad; se
  deja para cuando se implemente el cobro real (`06-stack.md`: "Stripe no está
  integrado todavía").

## Decisiones tomadas

- Preferimos un hueco antes que un número inventado. Sin clientes todavía, la
  credibilidad se construye mostrando el producto, no afirmando tracción.
- Ante una función de pago no implementada (Stripe) o una función de producto
  no implementada (reportes exportables, estadísticas avanzadas), se saca la
  mención por completo en vez de suavizarla o posponerla con una nota — es lo
  que se muestra justo antes de que alguien decida pagar.

## Bitácora

### Tarea 1 (frontend) — completada

**Archivos modificados:**
- `components/landing/hero-section.tsx`
- `components/app/layout/barra-lateral.tsx`
- `components/landing/precios-section.tsx`

**Qué se sacó y qué se puso en su lugar:**

1. `hero-section.tsx` — se sacó por completo el bloque "Social proof": la pila
   de 5 avatares inventados (`AVATARS`), las 5 estrellas fijas y el texto
   "+1,200 negocios confían en Eli" (cero negocios reales hoy). En su lugar va
   una línea con el diferenciador real del producto, tomado de
   `docs/PRODUCTO.md` §2 (el reparto de comisiones, "el centro del producto"):
   *"La comisión de cada profesional se calcula sola al completar la cita, sin
   planillas a fin de mes."* Es cierto y verificable: así es como funciona hoy
   (`Appointment.commissionPercent/Amount/At` se congela al completar la cita),
   no es una cifra de adopción ni una promesa vaga.
2. `barra-lateral.tsx` — se sacó `notificaciones: 3` del ítem de Chats y el
   bloque JSX que pintaba el badge numérico. Se revisó `GET /api/chats`
   (`app/api/chats/route.ts`) y el modelo `Message` en `prisma/schema.prisma`:
   no existe ningún campo de "leído", así que no hay manera de contar algo real
   sin tocar backend. Siguiendo la instrucción de la ficha, no se inventó un
   conteo (ej. total de conversaciones) que se leería como notificaciones sin
   serlo: el ítem de Chats ya no muestra número.
3. `barra-lateral.tsx` — se sacó `usuarioDefault` ("María García" / "Salón
   María"). Ahora, sin `usuario` (sesión no cargada), el pie de la barra
   lateral no inventa nombre ni negocio: muestra un ícono genérico de usuario
   y el texto "Sesión no disponible" en vez del nombre/negocio.
4. Barrido del resto de la landing: se encontró una cuarta cifra de adopción
   falsa en `precios-section.tsx:107` ("Miles de profesionales ya dejaron de
   coordinar citas por WhatsApp") y se reemplazó por un texto sin afirmar
   tracción. Detalle y lo que se dejó igual (el "Ahorra hasta 32%", que es un
   cálculo real de precios) en "Fuera de alcance detectado".

**Verificación:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (86
tests, 9 archivos) y `npm run build` — los cuatro en verde.

### Tarea 3 (frontend) — completada — corrección de los 5 hallazgos de QA + segundo barrido

QA verificó el barrido de la Tarea 1 y encontró 5 fallas reales que no se habían
tocado: se corrigen acá, y se agrega un barrido nuevo de toda afirmación de
funcionalidad en landing y modales de precios contra el código que la cumple.

**Archivos modificados:**
- `components/landing/precios-section.tsx`
- `components/app/modales/modal-precios.tsx`
- `components/app/layout/barra-superior.tsx`
- `components/landing/what-is-section.tsx`
- `components/landing/target-section.tsx`
- `app/crear-cuenta/page.tsx`

**Los 5 hallazgos de QA:**

1. **Stripe (bloqueante).** Sacada la frase "Pagos seguros con Stripe"
   (`precios-section.tsx:256`) y "Pagos procesados por Stripe"
   (`modal-precios.tsx:285`). Verificado que no hay ninguna integración de
   Stripe en el código (`provider-precios.tsx:32` tiene el TODO explícito). Lo
   que queda en esa línea — "Sin tarjeta de crédito para el trial" y "Cancela
   cuando quieras" — se verificó por separado:
   - "Sin tarjeta de crédito": `app/crear-cuenta/page.tsx` no tiene ningún
     campo de tarjeta en el formulario de alta, y `app/api/auth/registro` no
     la pide. Cierto.
   - "Cancela cuando quieras": no hay ningún mecanismo de cobro ni de
     permanencia mínima en el código (no hay Stripe, no hay campo de
     compromiso en `prisma/schema.prisma`), así que no hay nada que lo
     contradiga. Se deja.
2. **Reportes exportables / estadísticas avanzadas (bloqueante).** Sacadas las
   filas "Reportes exportables" (Starter/Equipo) y "Reportes + estadísticas
   avanzadas" (Pro) de `precios-section.tsx`, y "Reportes exportables PDF/CSV"
   y "Estadísticas avanzadas [+ horarios pico]" de las tres tablas en
   `modal-precios.tsx`. Verificado con `grep -ri "reportes\|exportar\|pdf\|csv\|estadísticas avanzadas" components/` y `app/api/`: no existe ningún endpoint
   ni componente de exportación o reportes en el código. Revisé que ningún
   plan quedara sin diferenciador tras sacar la fila: Starter sigue
   distinguiéndose por "Equipo de trabajadores: no incluido"; Equipo y Pro
   siguen distinguiéndose por "Hasta 5 trabajadores" vs "Trabajadores
   ilimitados" (la única fila que ya los diferenciaba, no se tocó). No hizo
   falta inventar un reemplazo.
3. **Nombre hardcodeado en `barra-superior.tsx` (mayor).** Se sacó
   `<AvatarUsuario nombre="María García" tamaño="sm" />`. Ahora
   `BarraSuperior` lee `useSession()` de `next-auth/react` (mismo hook que ya
   usa `app/dashboard/page.tsx` para `businessSlug`, confirmando que el
   `SessionProvider` ya envuelve el árbol — `components/providers.tsx`) y usa
   `session.user.name`. Sin sesión (o mientras carga), muestra un ícono
   genérico en vez de un nombre — mismo patrón que ya usa `barra-lateral.tsx`
   para el mismo caso. No se tocó `app/dashboard/layout.tsx` ni las 6 páginas
   que usan `BarraSuperior`: al resolver el dato dentro del propio componente
   client no hizo falta.
4. **Puntito de notificación siempre encendido (mayor).** Se sacó el
   `<span className="... bg-primary rounded-full" />` de la campana. Verificado
   que no existe ningún endpoint de notificaciones (`grep -ri "notificac" app/api/` sin resultados) ni un campo de "leído" en el modelo `Message`
   (ya documentado en "Fuera de alcance detectado" de la Tarea 1 para el badge
   de Chats — mismo motivo aplica acá). Sin dato real que mostrar, la campana
   queda sin indicador, con `aria-label="Notificaciones"` para el lector de
   pantalla.
5. **"Clientes más frecuentes" en `what-is-section.tsx` (mayor).** Reemplazado
   por "Dashboard con citas del día, clientes totales, ingresos y tasa de
   ocupación." Verificado contra `app/api/dashboard/stats/route.ts`: devuelve
   `citasHoy`, `totalPacientes`, `ingresoseMes` (sólo si el actor puede ver
   facturación) y `tasaOcupacion`; no hay ningún cálculo de frecuencia de
   visitas por cliente. No pude tocar `app/dashboard/page.tsx` (F-006 en curso
   ahí), pero no hizo falta: el endpoint ya deja claro qué se muestra.

**Segundo barrido — afirmaciones de funcionalidad vs. código que las cumple:**

- `precios-section.tsx` / `modal-precios.tsx`, `VALOR_ELI` — verificadas:
  "Reservas sin ida y vuelta" / página pública → `app/reservar/[slug]/page.tsx`;
  "Cero doble-reservas" → chequeo de conflicto en
  `app/api/reservar/[slug]/confirmar/route.ts:43-56`; "Recordatorios
  automáticos por email 24h" → `app/api/cron/recordatorios/route.ts`; "Página
  profesional" → idem página pública. Todas ciertas, no se tocaron.
- `components/landing/what-is-section.tsx` — "CRM de Clientes" (historial +
  notas) verificado en
  `app/dashboard/pacientes/_components/panelDetallePaciente.tsx:142-182`
  ("Historial de citas" y "Notas" reales, con `Patient.notes` en el esquema).
  "Chat Integrado" verificado contra `app/api/chats/route.ts` (endpoint real,
  no maqueta). El resto de las tarjetas (Calendario, Página Pública,
  Recordatorios) ya estaban respaldadas por endpoints reales. No se tocaron.
- `components/landing/target-section.tsx` — encontradas tres "necesidades
  clave" que prometían algo que el modelo de datos no tiene: "Clases grupales
  con cupo limitado" (no hay campo de cupo/capacidad en `Appointment` ni
  concepto de clase grupal — cada cita es 1:1 con un paciente), "Reserva de
  sesiones y uso de equipos" (no hay gestión de equipos/recursos) y "Gestión
  de talleres y materiales incluidos" (no hay inventario de materiales).
  Reemplazadas por afirmaciones que sí cumple el código: "Agenda por
  instructor, sin cruces de horario" y "Reserva de sesiones sin
  doble-reservas" (mismo chequeo de conflicto citado arriba) y "Notas y
  seguimiento por alumno" (`Patient.notes`, mismo verificado que en CRM). El
  resto de las tarjetas de esa sección ("Historial clínico básico",
  "Privacidad y notas por cliente", etc.) se apoyan en lo mismo (notas +
  historial de citas + aislamiento por `businessId`) y se dejaron igual.
- **`app/crear-cuenta/page.tsx:119`** y **`modal-precios.tsx:149`** — dos
  cifras de adopción falsas más, mismo patrón que la del hero ("+1,200
  negocios") y la de `precios-section.tsx` ya corregida en la Tarea 1.
  Detalle y reemplazo en "Fuera de alcance detectado". No están en
  `components/landing/` ni son estrictamente "modales de precios" en el caso
  de `crear-cuenta`, pero son el mismo dato inventado que esta ficha existe
  para sacar, así que se corrigieron en el mismo barrido en vez de dejarlas
  pasar.
- No se tocó `components/landing/dashboard-preview-section.tsx` (maqueta
  ilustrativa, ya evaluada como fuera de alcance en la Tarea 1) ni
  `components/landing/contact-section.tsx`/`footer.tsx`/`header.tsx` (no
  contienen afirmaciones de funcionalidad del producto; "Respondemos en
  menos de 24h" es una política de soporte, no una función de código, y
  "Integraciones" en el footer es un enlace ancla sin funcionalidad prometida
  en el texto — no es un dato inventado, es un link muerto, fuera del alcance
  de esta ficha).

**Verificación:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (89
tests, 9 archivos) y `npm run build` — los cuatro en verde.
