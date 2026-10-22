"use client"

import { useState, type ReactNode } from "react"
import {
  ArrowUpRight,
  Calculator,
  CalendarDays,
  Check,
  ChartColumn,
  Clock,
  CreditCard,
  Info,
  Link2,
  Mail,
  Minus,
  Plus,
  RotateCcw,
  SquareKanban,
  StickyNote,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Insignia } from "@/components/comunes/insignia"
import { EncabezadoDeSeccion, Seccion } from "@/components/comunes/seccion"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { PilaDeTarjetas, type TarjetaDeLaPila } from "@/components/movimiento/pila-de-tarjetas"
import { Revelar } from "@/components/movimiento/revelar"
import type { ColorDeModulo } from "@/lib/modulos"
import {
  calcularPrecio,
  DIAS_DE_PRUEBA,
  formatearPesos,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
} from "@/lib/precios"
import { cn } from "@/lib/utils"

/** Lo que trae Eli en los dos planes: las piezas de "Lo que trae Eli", sin la del equipo, que es del plan Equipo. */
const FUNCIONES: readonly { id: string; titulo: string; icono: LucideIcon; color: ColorDeModulo }[] = [
  { id: "agenda", titulo: "Agenda por profesional", icono: CalendarDays, color: "azul" },
  { id: "pagina-de-reservas", titulo: "Página de reservas", icono: Link2, color: "azul" },
  { id: "recordatorios", titulo: "Recordatorios por correo", icono: Mail, color: "azul" },
  { id: "clientes", titulo: "Clientes con notas", icono: StickyNote, color: "lila" },
  { id: "tablero", titulo: "Tablero del día", icono: SquareKanban, color: "naranja" },
  { id: "pago-dividido", titulo: "Pago dividido", icono: CreditCard, color: "lima" },
  { id: "reportes", titulo: "Reportes de lo cobrado", icono: ChartColumn, color: "lima" },
  { id: "anulaciones", titulo: "Anulaciones con registro", icono: RotateCcw, color: "lima" },
  { id: "servicios-y-horarios", titulo: "Servicios y horarios", icono: Clock, color: "turquesa" },
]

const DIA_CON_ELI = [
  "Tus clientes reservan solos en tu página, a cualquier hora.",
  "Antes de cada cita les llega un recordatorio por correo.",
  "Cobras desde el tablero y al cerrar el día ves cuánto entró.",
  "Cada cliente con sus notas y el historial de sus visitas.",
] as const

/** Las iniciales del equipo de ejemplo, cada una en un pastel fuerte. */
const EQUIPO_DE_EJEMPLO = [
  { iniciales: "Tú", fondo: "bg-turquesa" },
  { iniciales: "CA", fondo: "bg-azul" },
  { iniciales: "MF", fondo: "bg-lila" },
  { iniciales: "JR", fondo: "bg-naranja" },
  { iniciales: "VL", fondo: "bg-lima" },
] as const

const ROLES = [
  { rol: "Dueño", texto: "Ve todo el negocio. El plan y el pago son solo tuyos." },
  {
    rol: "Encargado",
    texto: "Organiza la agenda, los servicios y el equipo. No cuenta como persona que atiende.",
  },
  { rol: "Profesional", texto: "Ve su agenda, sus citas y lo que lleva cobrado. Siempre cuenta." },
] as const

/** Los límites del contador de la calculadora, y con cuánto empieza. */
const PERSONAS_MINIMAS = 1
const PERSONAS_MAXIMAS = 30
const PERSONAS_AL_EMPEZAR = 7

const TEXTO_DE_PRUEBA = `Probar ${DIAS_DE_PRUEBA} días gratis`

/** El cuerpo de las tarjetas de plan: una columna en el teléfono, dos desde lg. */
const CUERPO_DE_TARJETA =
  "grid grid-cols-1 gap-7 px-5 py-7 md:p-10 lg:min-h-[480px] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 xl:px-14 xl:py-12"

const TITULO_DE_PLAN =
  "mt-5 font-serif text-[2.25rem] font-medium leading-[1.1] tracking-[-1px] text-balance md:text-5xl md:tracking-[-1.5px]"

const BAJADA = "mt-3 max-w-[440px] text-base leading-normal"

/** El panel de color a la derecha de cada plan. */
const PANEL = "flex flex-col gap-5 rounded-panel px-6 py-7 squircle"

/** La isla con el encabezado de precios y la pila de tarjetas con los planes. */
export function SeccionPrecios() {
  const tarjetas: readonly TarjetaDeLaPila[] = [
    { id: "incluido", contenido: <TarjetaIncluido /> },
    { id: "independiente", contenido: <TarjetaIndependiente /> },
    { id: "equipo", contenido: <TarjetaEquipo /> },
    { id: "calculadora", contenido: <TarjetaCalculadora /> },
  ]

  return (
    <>
      <Seccion id="precios" fondo="degradado" aria-labelledby="precios-titulo">
        <Revelar className="flex flex-col items-center">
          <EncabezadoDeSeccion
            id="precios-titulo"
            antetitulo="Precios"
            titulo="Dos planes. Las mismas funciones."
            subtitulo="Lo único que cambia es cuántas personas atienden. En pesos chilenos, con IVA incluido."
          />
          <ul className="mt-7 flex flex-wrap justify-center gap-2">
            {[`${DIAS_DE_PRUEBA} días de prueba`, "Sin tarjeta para empezar", "Cobro mensual"].map((texto) => (
              <li key={texto}>
                <Insignia className="bg-tarjeta">{texto}</Insignia>
              </li>
            ))}
          </ul>
        </Revelar>
      </Seccion>

      <Seccion
        fondo="superficie"
        aria-labelledby="planes-titulo"
        interior="pt-6 md:pt-6 xl:pt-6"
      >
        <h2 id="planes-titulo" className="sr-only">
          Los planes
        </h2>
        <PilaDeTarjetas tarjetas={tarjetas} className="mt-12" />
      </Seccion>
    </>
  )
}

/** Lo que tienen los dos planes, en navy. */
function TarjetaIncluido() {
  return (
    <article
      aria-labelledby="incluido-titulo"
      className={cn("rounded-tarjeta bg-navy text-white squircle anillo-foco-claro", CUERPO_DE_TARJETA)}
    >
      <div>
        <Antetitulo className="text-white/75">Incluido en los dos planes</Antetitulo>
        <h3 id="incluido-titulo" className={cn(TITULO_DE_PLAN, "text-white")}>
          Todo lo que trae Eli, sin funciones bloqueadas.
        </h3>
        <p className={cn(BAJADA, "text-white/75")}>
          Prueba {DIAS_DE_PRUEBA} días gratis, sin tarjeta, contados desde que creas tu negocio.
        </p>
        <Boton href="/crear-cuenta" variante="invertido" tamano="lg" icono={<ArrowUpRight />} className="mt-8">
          Crear mi cuenta
        </Boton>
      </div>
      <ul className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2">
        {FUNCIONES.map((funcion) => (
          <li
            key={funcion.id}
            className="flex items-center gap-3.5 rounded-[20px] bg-white/6 px-3.5 py-3 font-medium squircle"
          >
            <CuadroDeIcono icono={funcion.icono} color={funcion.color} activo />
            {funcion.titulo}
          </li>
        ))}
      </ul>
    </article>
  )
}

/** El cuadro del plan, su insignia, el nombre, la bajada y el precio. */
function CabeceraDePlan({
  id,
  icono,
  color,
  insignia,
  nombre,
  bajada,
  precio,
  nota,
}: {
  id: string
  icono: LucideIcon
  color: ColorDeModulo
  insignia: string
  nombre: string
  bajada: string
  precio: number
  nota: string
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <CuadroDeIcono icono={icono} color={color} tamano="lg" activo />
        <Insignia tono={color}>{insignia}</Insignia>
      </div>
      <h3 id={id} className={TITULO_DE_PLAN}>
        {nombre}
      </h3>
      <p className={cn(BAJADA, "text-texto-2")}>{bajada}</p>
      <p className="mt-7 flex items-baseline gap-1.5">
        <span className="text-5xl font-medium leading-none tracking-[-2px] tabular-nums md:text-7xl">
          {formatearPesos(precio)}
        </span>
        <span className="text-lg text-texto-2">/mes</span>
      </p>
      <p className="mt-2 text-sm text-texto-2">{nota}</p>
    </>
  )
}

function Separador() {
  return <hr className="h-px border-0 bg-navy/12" />
}

/** Una nota al pie del panel de un plan, en una franja blanca. */
function Aparte({ icono: Icono, children }: { icono: LucideIcon; children: ReactNode }) {
  return (
    <p className="flex items-start gap-3 rounded-[20px] bg-tarjeta/70 px-4 py-3.5 text-[0.9375rem] leading-[1.45] squircle">
      <Icono aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" strokeWidth={2} />
      <span>{children}</span>
    </p>
  )
}

function TarjetaIndependiente() {
  return (
    <Tarjeta
      como="article"
      aria-labelledby="independiente-titulo"
      className={cn("ring-1 ring-borde halo-agenda", CUERPO_DE_TARJETA)}
    >
      <div>
        <CabeceraDePlan
          id="independiente-titulo"
          icono={UserRound}
          color="azul"
          insignia="Para quien atiende solo"
          nombre="Independiente"
          bajada="Tu agenda, tu página de reservas, el tablero del día y los reportes. Todo Eli, para ti."
          precio={PRECIO_INDEPENDIENTE}
          nota="IVA incluido"
        />
        <Boton href="/crear-cuenta" tamano="lg" icono={<ArrowUpRight />} className="mt-8">
          {TEXTO_DE_PRUEBA}
        </Boton>
      </div>
      <div className={cn(PANEL, "bg-azul-suave")}>
        <div>
          <Antetitulo className="text-navy">Quién atiende</Antetitulo>
          <div className="mt-3.5 flex items-center gap-3">
            <Avatar fondo="bg-azul">Tú</Avatar>
            <span className="text-[0.9375rem] font-medium">Atiendes y administras todo, sin equipo que coordinar.</span>
          </div>
        </div>
        <Separador />
        <div>
          <Antetitulo className="text-navy">Tu día con Eli</Antetitulo>
          <ul className="mt-3.5 flex flex-col gap-3">
            {DIA_CON_ELI.map((texto) => (
              <li key={texto} className="flex items-start gap-3 leading-[1.45]">
                <span aria-hidden="true" className="-mt-px grid size-6 shrink-0 place-items-center rounded-full bg-tarjeta">
                  <Check className="size-3.5" strokeWidth={2.5} />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>
        <Aparte icono={ArrowUpRight}>
          ¿Sumas a alguien? Te pasas a Equipo y tu agenda, tus clientes y tu historial siguen ahí.
        </Aparte>
      </div>
    </Tarjeta>
  )
}

/** Un círculo con iniciales, decorativo: el texto de al lado dice lo mismo. */
function Avatar({ fondo, children }: { fondo: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-[0.8125rem] font-semibold text-navy ring-3 ring-tarjeta",
        fondo
      )}
    >
      {children}
    </span>
  )
}

function TarjetaEquipo() {
  const adicional = formatearPesos(PRECIO_PERSONA_ADICIONAL)
  return (
    <Tarjeta
      como="article"
      aria-labelledby="equipo-titulo"
      className={cn("ring-1 ring-borde halo-equipo", CUERPO_DE_TARJETA)}
    >
      <div>
        <CabeceraDePlan
          id="equipo-titulo"
          icono={Users}
          color="turquesa"
          insignia="Para el negocio con equipo"
          nombre="Equipo"
          bajada="Tú, tu encargado y tus profesionales, cada uno con su rol y su agenda."
          precio={PRECIO_EQUIPO}
          nota={`IVA incluido · ${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden`}
        />
        <p className="mt-4 flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium">
          <Insignia tono="turquesa">+{adicional}/mes</Insignia>
          por cada persona más
        </p>
        <Boton href="/crear-cuenta" tamano="lg" icono={<ArrowUpRight />} className="mt-7">
          {TEXTO_DE_PRUEBA}
        </Boton>
      </div>
      <div className={cn(PANEL, "bg-turquesa-suave")}>
        <div>
          <Antetitulo className="text-navy">Quién atiende</Antetitulo>
          <div
            role="img"
            aria-label={`${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden incluidas, y un lugar más por ${adicional} al mes`}
            className="mt-3.5 flex flex-wrap items-center gap-2"
          >
            {EQUIPO_DE_EJEMPLO.map((persona) => (
              <Avatar key={persona.iniciales} fondo={persona.fondo}>
                {persona.iniciales}
              </Avatar>
            ))}
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-navy text-xs font-medium"
            >
              +1
            </span>
          </div>
          <p className="mt-2.5 text-sm leading-[1.4]">
            <strong className="font-semibold">{PERSONAS_INCLUIDAS_EQUIPO} incluidas.</strong> Desde la sexta, {adicional}{" "}
            al mes por persona.
          </p>
        </div>
        <Separador />
        <div>
          <Antetitulo className="text-navy">Cada uno con su rol</Antetitulo>
          <dl className="mt-3.5 flex flex-col gap-3.5 text-[0.9375rem] leading-[1.45]">
            {ROLES.map(({ rol, texto }) => (
              <div key={rol} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[104px_minmax(0,1fr)] sm:items-baseline sm:gap-3">
                <dt className="font-semibold">{rol}</dt>
                <dd>{texto}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Aparte icono={Info}>Los cambios en tu equipo se cobran desde el mes siguiente, sin cobros a medio mes.</Aparte>
      </div>
    </Tarjeta>
  )
}

/** Un botón redondo del contador. Al llegar al límite queda `aria-disabled` y no `disabled`, para no perder el foco. */
function BotonDePaso({
  etiqueta,
  icono: Icono,
  bloqueado,
  alPulsar,
}: {
  etiqueta: string
  icono: LucideIcon
  bloqueado: boolean
  alPulsar: () => void
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      aria-disabled={bloqueado}
      onClick={bloqueado ? undefined : alPulsar}
      className="grid size-12 shrink-0 place-items-center rounded-full border-[1.5px] border-navy text-navy anillo-foco transition-colors duration-150 ease-suave hover:bg-navy/6 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
    >
      <Icono aria-hidden="true" className="size-5" strokeWidth={2} />
    </button>
  )
}

function TarjetaCalculadora() {
  const [personas, setPersonas] = useState(PERSONAS_AL_EMPEZAR)
  const calculo = calcularPrecio(personas)
  const independiente = calculo.plan === "independiente"
  const etiquetaDePersonas = personas === 1 ? "persona atiende" : "personas atienden"

  return (
    <Tarjeta
      como="article"
      aria-labelledby="calculadora-titulo"
      className={cn("ring-1 ring-borde halo-reportes", CUERPO_DE_TARJETA)}
    >
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <CuadroDeIcono icono={Calculator} color="lima" tamano="lg" activo />
          <Insignia tono="lima">Sin sorpresas</Insignia>
        </div>
        <h3 id="calculadora-titulo" className={TITULO_DE_PLAN}>
          ¿Cuánto pagarías?
        </h3>
        <p className={cn(BAJADA, "text-texto-2")}>
          Cuentan los profesionales, y tú si atiendes. Los cambios se cobran desde el mes siguiente, sin cobros a medio
          mes.
        </p>
        <div className="mt-5 flex items-center gap-4">
          <BotonDePaso
            etiqueta="Una persona menos"
            icono={Minus}
            bloqueado={personas <= PERSONAS_MINIMAS}
            alPulsar={() => setPersonas((actual) => Math.max(PERSONAS_MINIMAS, actual - 1))}
          />
          <p className="min-w-[120px] text-center">
            <span className="block text-5xl font-medium leading-none tracking-[-2px] tabular-nums">{personas}</span>
            <span className="text-sm text-texto-2">{etiquetaDePersonas}</span>
          </p>
          <BotonDePaso
            etiqueta="Una persona más"
            icono={Plus}
            bloqueado={personas >= PERSONAS_MAXIMAS}
            alPulsar={() => setPersonas((actual) => Math.min(PERSONAS_MAXIMAS, actual + 1))}
          />
        </div>
      </div>

      {/* Lo que cambia con el contador se anuncia entero, empezando por cuántas personas son. */}
      <div aria-live="polite" aria-atomic="true" className={cn(PANEL, "justify-center bg-lima-suave")}>
        <p className="sr-only">
          {personas} {etiquetaDePersonas}.
        </p>
        <Antetitulo className="text-navy">{independiente ? "Plan Independiente" : "Plan Equipo"}</Antetitulo>
        <ul className="flex flex-col gap-2.5">
          <li className="flex justify-between gap-4">
            <span>
              {independiente ? "Independiente, solo tú" : `Equipo, ${PERSONAS_INCLUIDAS_EQUIPO} personas incluidas`}
            </span>
            <span className="tabular-nums">{formatearPesos(calculo.montoBase)}</span>
          </li>
          {calculo.adicionales > 0 && (
            <li className="flex justify-between gap-4">
              <span>
                +{calculo.adicionales} {calculo.adicionales === 1 ? "persona" : "personas"} ×{" "}
                {formatearPesos(PRECIO_PERSONA_ADICIONAL)}
              </span>
              <span className="tabular-nums">{formatearPesos(calculo.montoAdicional)}</span>
            </li>
          )}
        </ul>
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-navy/15 pt-4">
          <span>Al mes, IVA incluido</span>
          <strong className="text-[2.5rem] font-medium tracking-[-1.5px] tabular-nums">
            {formatearPesos(calculo.total)}
          </strong>
        </p>
      </div>
    </Tarjeta>
  )
}
