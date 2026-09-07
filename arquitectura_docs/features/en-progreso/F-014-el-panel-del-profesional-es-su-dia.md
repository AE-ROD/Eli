---
id: F-014
titulo: El panel del profesional es su día
estado: en-progreso
prioridad: media
areas: [backend, frontend]
rama: v1
estimacion: media
max_iteraciones: 3
---

# F-014 — El panel del profesional es su día

## Problema

Dirección **A** de la propuesta de identidad, aprobada como vista del
profesional: *«Si el producto es el tiempo, el panel debería abrir en el tiempo:
las horas del día, con los huecos a la vista»*.

Hoy Carla —una `worker`— abre el panel y ve dos tarjetas con números y un cartel
que dice «Sin citas para hoy». Eso no le sirve: **no necesita un tablero,
necesita su día**. Un tablero es para quien administra el negocio; ella lo que
tiene que saber es a qué hora entra, qué tiene entre medio y cuánto le queda
libre.

Y los huecos son información: son horas que se pueden vender. La tarjeta «Tasa de
ocupación 0%» no decía eso —la sacamos en F-008 por otros motivos—; una línea de
tiempo con los espacios vacíos a la vista sí lo dice.

## Alcance

**Incluye:**
- Para un `worker`, el panel abre en la línea de tiempo de su día.
- Las horas vienen de **su horario configurado**, no de un rango inventado.
- Los huecos se ven como huecos.
- Un resumen honesto del día: cuántas citas, cuánto tiempo sin reservar.

**NO incluye:**
- **Cambiar el panel del dueño ni del encargado.** Ellos administran el negocio y
  su vista se queda como está. Esta ficha sólo cambia lo que ve el `worker`.
- Tocar el calendario (`/dashboard/calendario`), que es otra pantalla.
- Crear, mover o editar citas desde la línea de tiempo. Sólo se muestra.
- Cambiar el modelo de datos.

## Criterios de aceptación

- [ ] Un `worker` ve su día por horas al entrar al panel; dueño y encargado ven
      exactamente lo que veían antes.
- [ ] **Las horas salen del horario real del profesional** (`WorkSchedule`). Si no
      tiene horario configurado para hoy, **no se inventa un rango**: se dice que
      no tiene horario cargado y se muestran las citas que haya.
- [ ] Las citas aparecen en su franja, con hora, servicio y cliente.
- [ ] Una cita **sin cliente** no rompe la vista: el esquema lo permite y ya tiró
      el panel una vez (ver F-008).
- [ ] Los huecos entre citas se distinguen de las franjas ocupadas.
- [ ] El tiempo libre que se muestre **se calcula**, no se estima: si no se puede
      calcular con datos reales, no se muestra.
- [ ] Un día sin citas se lee como un día libre, no como un error.
- [ ] Sigue sin ver ingresos del negocio ni citas de sus colegas (F-006).
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- `app/dashboard/page.tsx` — el panel. Ya distingue por rol para los ingresos.
- `app/api/dashboard/stats/route.ts` — `citasHoyLista` ya viene acotada al
  profesional por `whereDeAgenda` (F-006) y con `take`. **No hace falta un
  endpoint nuevo para las citas**; sí puede hacer falta el horario del día.
- `WorkSchedule` (`prisma/schema.prisma`): `dayOfWeek` (0 = domingo),
  `startTime` y `endTime` como `"HH:MM"`, `memberId` para el horario propio y
  `null` para el general del negocio.
- `app/api/configuracion/horarios/route.ts` ya sabe resolver el horario de un
  miembro respetando permisos: mirá `resolverObjetivo()` antes de escribir otra
  consulta.
- La regla de interfaz vigente está en `arquitectura_docs/reglas/02-codigo.md`,
  sección «Interfaz»: ninguna cifra sin procedencia, ningún dato de ejemplo, un
  estado vacío que explique.
- Referencia visual de la propuesta aprobada: horas a la izquierda, la cita como
  un bloque con borde de color, los huecos con una trama tenue, y abajo una línea
  tipo «7 h sin reservar hoy».

## Fuera de alcance detectado

<!-- El agente completa acá. -->

## Decisiones tomadas

- La línea de tiempo es **para el profesional**, no para todos. El dueño con
  cinco personas necesita ver el negocio; el profesional, su día. Son dos
  preguntas distintas y no se resuelven con la misma pantalla.
- **Frontend — reemplazo completo del tablero para `worker`**: cuando
  `esWorker`, el panel no muestra las tarjetas de estadísticas, "Pacientes
  recientes", "Enlace de reservas" ni el gráfico/resumen duplicado — sólo la
  línea de tiempo. La ficha describe el problema como "dos tarjetas con
  números y un cartel que no le sirven"; dejar esos widgets al lado de la
  línea de tiempo hubiera sido la mitad del arreglo. Dueño y encargado siguen
  viendo todo eso tal cual porque su rama de JSX no se tocó.

## Bitácora

### Backend — horario de hoy en `GET /api/dashboard/stats`

- **Qué se agregó**: `horarioHoy`, un array de franjas `{ startTime, endTime }`
  ("HH:MM") con el horario **activo** de hoy del `WorkSchedule` del actor
  (`memberId` propio, `dayOfWeek` de hoy). Se calcula con `Promise.all` junto al
  resto de las consultas del endpoint.
- **Sólo para `worker`**: se computa (y sólo entonces se dispara la consulta a
  `workSchedule.findMany`) cuando `actor.rol === "worker"`. Dueño y encargado no
  reciben la clave ni generan la query — cubierto por un test que confirma
  `workSchedule.findMany` sin llamar.
- **Contrato "sin dato, sin clave"**: si no hay franjas (`active: true`) para el
  `dayOfWeek` de hoy, `horarioHoy` **no viaja** en la respuesta. Ni `null`, ni
  `[]`, ni un rango por defecto. Mismo contrato que `ingresoseMes` /
  `tendencias.ingresos` en F-006/F-008.
- **Decisión tomada — un solo bucket para "no trabaja hoy"**: `WorkSchedule`
  puede tener una fila para el día de hoy con `active: false` (día marcado
  como libre desde `/dashboard/configuracion`) o directamente no tener fila
  para ese `dayOfWeek`. La ficha pide que el front distinga "no trabaja hoy /
  no tiene horario cargado" de "trabaja de 9 a 18", pero **no pide distinguir
  esos dos casos entre sí** — y no hay forma honesta de hacerlo desde el punto
  de vista del panel: en ambos casos el profesional no tiene una franja para
  hoy. Por eso el filtro incluye `active: true` y ambos casos colapsan en "la
  clave no viaja". Si más adelante se necesita diferenciar "día libre
  explícito" de "nunca configuró horario", hace falta una ficha nueva: hoy el
  panel no tiene ningún criterio de aceptación que lo pida.
- **No se reimplementó `resolverObjetivo()`**: este endpoint nunca acepta
  `memberId` por querystring, así que la única rama relevante de ese resolver
  es la de "horario propio" (`paramMemberId` ausente). La consulta acá es
  exactamente esa rama (`memberId: actor.memberId`), documentada en un
  comentario que remite a `app/api/configuracion/horarios/route.ts` para que
  quede claro que no es una segunda forma de resolver lo mismo.
- **Aislamiento**: la consulta usa siempre `actor.memberId`, nunca un id
  recibido por request. `businessId` se sigue filtrando en todas las queries.
- **Archivos**: `app/api/dashboard/stats/route.ts`,
  `app/api/dashboard/stats/route.test.ts` (3 tests nuevos: horario con
  franjas, sin franjas → sin clave, dueño no dispara la consulta ni recibe la
  clave; los 9 casos previos siguen en verde, 12 en total).
- **Verificación**: `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (154
  tests, todos en verde) y `npm run build` — los cuatro en verde.
- **Fuera de alcance**: no se tocó `app/dashboard/page.tsx` ni componentes
  (tarea de frontend), ni `prisma/schema.prisma`, ni `middleware.ts`.

### Frontend — la línea de tiempo del profesional

- **`app/dashboard/page.tsx`**: se agrega `horarioHoy?` a `StatsData` y se
  calcula `esWorker` desde `session.user.role`. El JSX del dueño/encargado
  queda **exactamente igual**, sólo envuelto en `{esWorker ? <VistaDiaProfesional
  stats={stats} /> : (...todo lo que ya existía...)}` — mismo árbol, mismas
  condiciones, sin tocar una línea de su rama. `formatHora` y
  `duracionMinutos` (antes locales al archivo) se movieron a `lib/utils.ts`
  porque el componente nuevo también los necesita: es la segunda vez que
  hacía falta la misma conversión, no una abstracción especulativa.
- **`lib/horario-dia.ts`** (nuevo, puro, sin red ni Prisma): arma los
  segmentos cita/hueco de una franja (`segmentosDeFranja`), detecta citas que
  no caen en ninguna franja (`citasFueraDeFranjas` — para no ocultar una cita
  si el horario cambió después de agendarla), calcula el tiempo libre real
  (`minutosLibresEnFranjas`, horario menos ocupado, nunca estimado) y formatea
  duraciones/horas. `WorkSchedule` es `"HH:MM"` sin fecha: se compara en
  minutos desde medianoche, nunca como `Date`; las citas sí son instantes ISO
  y se leen con `Date` en hora local del navegador, igual que ya hacía
  `formatHora`. 13 tests en `lib/horario-dia.test.ts` (franja sin citas → un
  solo hueco completo, huecos intercalados, recorte de una cita que empieza
  antes de la franja, cita totalmente fuera de franja, cálculo de libres con y
  sin citas, día completo sin libre, formatos de duración y de hora).
- **`app/dashboard/_components/lineaDeTiempoDia.tsx`** (nuevo): pinta cada
  franja como una lista vertical con la hora a la izquierda de cada segmento;
  una cita se muestra reutilizando `TarjetaCita` (`compacta`, el mismo
  componente que ya usaba el tablero — nada nuevo para pintar una cita) y un
  hueco con una trama diagonal tenue + borde punteado, a propósito distinta al
  borde de color de una cita. Entre dos franjas (turno partido) se muestra una
  línea muda "13:00–14:00 · fuera de tu horario": ese tiempo no es hueco
  vendible, así que no se dibuja como tal. Las citas que no caen en ninguna
  franja no desaparecen: se listan aparte al final ("Fuera de tu horario
  cargado").
- **`app/dashboard/_components/vistaDiaProfesional.tsx`** (nuevo): decide
  entre los tres estados. Cargando (`stats === null`): mensaje neutro. Sin
  `horarioHoy`: aviso ambar "No tenés un horario cargado para hoy" con link a
  `/dashboard/configuracion` (no se inventa un rango 09–18) y, debajo, la
  lista de citas que haya (o "Tampoco tenés citas agendadas" si tampoco hay,
  para no mezclar dos vacíos en un solo mensaje). Con `horarioHoy`: título
  "N citas hoy" o **"Tu día está libre"** cuando `citasHoy === 0` (no es un
  error, es la lectura correcta del mismo cálculo), subtítulo con el tiempo
  libre real (`"Tu agenda de hoy está completa"` cuando da cero) y la
  `LineaDeTiempoDia` debajo.
- **Ningún componente se copió**: `TarjetaCita`, `BarraSuperior` y las
  primitivas de `components/ui/` se reutilizan tal cual. `citaParaTarjeta`
  (endpoint → prop de `TarjetaCita`) se define una sola vez en
  `lineaDeTiempoDia.tsx` y se reexporta para `vistaDiaProfesional.tsx`, en vez
  de duplicarla.
- **Dueño y encargado no tienen `horarioHoy` en la respuesta** (server ya lo
  garantiza), así que `esWorker` es la única condición que importa: nunca ven
  `VistaDiaProfesional`, y su árbol de JSX es el de siempre.
- **Verificación**: `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (167
  tests, todos en verde, 13 nuevos de `horario-dia`) y `npm run build` — los
  cuatro en verde.
- **Archivos**: `app/dashboard/page.tsx`, `lib/utils.ts` (nuevas
  `formatHora`/`duracionMinutos`), `lib/horario-dia.ts` (nuevo),
  `lib/horario-dia.test.ts` (nuevo),
  `app/dashboard/_components/lineaDeTiempoDia.tsx` (nuevo),
  `app/dashboard/_components/vistaDiaProfesional.tsx` (nuevo).
- **Fuera de alcance**: no se tocó `/dashboard/calendario`, no se creó ni
  editó ninguna cita desde la línea de tiempo (sólo lectura), no se cambió
  nada de `app/api/**` ni `middleware.ts`, no se tocó el árbol de dueño/encargado.
