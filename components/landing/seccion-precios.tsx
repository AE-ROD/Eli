"use client"

import { useState, type ReactNode } from "react"
import {
  ArrowUpRight,
  CalendarDays,
  ChartColumn,
  Check,
  Clock,
  CreditCard,
  FileText,
  Link2,
  Mail,
  Minus,
  Plus,
  RotateCcw,
  Shield,
  SquareKanban,
  User,
  Users,
  type LucideIcon,
} from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { EncabezadoDeLanding, SeccionDeLanding } from "@/components/landing/seccion-de-landing"
import { CLASES_DE_TONO, tonoEn, type TonoDeLanding } from "@/components/landing/tonos-de-la-landing"
import { TRAZOS_DE_INCLUIDO, TRAZOS_DE_PRECIOS } from "@/components/landing/trazos-de-la-landing"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { TrazosOndulantes } from "@/components/movimiento/trazos-ondulantes"
import { useBloqueEnMovimiento } from "@/components/movimiento/usar-bloque-en-movimiento"
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
const FUNCIONES: readonly { id: string; titulo: string; icono: LucideIcon }[] = [
  { id: "agenda", titulo: "Agenda por profesional", icono: CalendarDays },
  { id: "pagina-de-reservas", titulo: "Página de reservas", icono: Link2 },
  { id: "recordatorios", titulo: "Recordatorios por correo", icono: Mail },
  { id: "clientes", titulo: "Clientes con notas", icono: FileText },
  { id: "tablero", titulo: "Tablero del día", icono: SquareKanban },
  { id: "pago-dividido", titulo: "Pago dividido", icono: CreditCard },
  { id: "reportes", titulo: "Reportes de lo cobrado", icono: ChartColumn },
  { id: "anulaciones", titulo: "Anulaciones con registro", icono: RotateCcw },
  { id: "servicios-y-horarios", titulo: "Servicios y horarios", icono: Clock },
]

const DIA_CON_ELI = [
  "Tus clientes reservan solos en tu página, a cualquier hora.",
  "Antes de cada cita les llega un recordatorio por correo.",
  "Cobras desde el tablero y al cerrar el día ves cuánto entró.",
  "Cada cliente con sus notas y el historial de sus visitas.",
] as const

/** Las iniciales del equipo de ejemplo: tú y quienes atienden contigo. Se muestran tantas como incluye el plan. */
const INICIALES_DE_EJEMPLO = ["Tú", "C", "A", "M", "F", "J", "R", "V", "L", "S"] as const

const ROLES: readonly { rol: string; texto: string; icono: LucideIcon; tono: TonoDeLanding }[] = [
  { rol: "Dueño", texto: "Ve todo el negocio. El plan y el pago son solo tuyos.", icono: Shield, tono: "ciruela" },
  {
    rol: "Encargado",
    texto: "Organiza la agenda, los servicios y el equipo. No cuenta como persona que atiende.",
    icono: Users,
    tono: "frambuesa",
  },
  { rol: "Profesional", texto: "Ve su agenda, sus citas y lo que lleva cobrado. Siempre cuenta.", icono: User, tono: "pistacho" },
]

const PILDORAS: readonly { texto: string; icono: LucideIcon; tono: TonoDeLanding }[] = [
  { texto: `${DIAS_DE_PRUEBA} días de prueba`, icono: CalendarDays, tono: "ciruela" },
  { texto: "Sin tarjeta para empezar", icono: Shield, tono: "pistacho" },
  { texto: "Cobro mensual", icono: Clock, tono: "frambuesa" },
]

/** Los límites del contador de la calculadora, y con cuánto empieza. */
const PERSONAS_MINIMAS = 1
const PERSONAS_MAXIMAS = 30
const PERSONAS_AL_EMPEZAR = 7

const TEXTO_DE_PRUEBA = `Probar ${DIAS_DE_PRUEBA} días gratis`

const ORDINALES = ["primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima", "octava", "novena", "décima"]

/** "sexta" para el 6: la persona desde la que se cobra aparte, dicha como en el texto. */
function ordinal(numero: number): string {
  return ORDINALES[numero - 1] ?? `${numero}.ª`
}

/** Sobre los tintes, el gris del texto secundario no llega a 4,5:1: navy al 75%. */
const TEXTO_SOBRE_TINTE = "text-navy/75"

/**
 * Precios y planes. Arriba, el titular con tres píldoras y unas líneas que
 * se ondulan; abajo, lo que traen los dos planes, las tarjetas de
 * Independiente y Equipo, y la calculadora. La tarjeta del plan que da la
 * calculadora queda resaltada.
 *
 * Todo precio, las personas incluidas y los días de prueba salen de
 * `lib/precios.ts` (`calcularPrecio`, `formatearPesos` y las constantes):
 * nada escrito a mano.
 */
export function SeccionPrecios() {
  const [personas, setPersonas] = useState(PERSONAS_AL_EMPEZAR)
  const calculo = calcularPrecio(personas)

  return (
    <>
      <EncabezadoDePrecios />
      <SeccionDeLanding id="planes" etiquetadaPor="planes-titulo" tono="ciruela" interior="pt-2 md:pt-4">
        <h2 id="planes-titulo" className="sr-only">
          Los planes
        </h2>
        <Incluido />
        <div className="mt-7 grid items-stretch gap-6 md:grid-cols-2">
          <TarjetaIndependiente resaltada={calculo.plan === "independiente"} />
          <TarjetaEquipo resaltada={calculo.plan === "equipo"} />
        </div>
        <Calculadora personas={personas} alCambiar={setPersonas} />
      </SeccionDeLanding>
    </>
  )
}

/** El titular de precios, las tres píldoras y las líneas que se ondulan debajo, de borde a borde. */
function EncabezadoDePrecios() {
  const { ref, pausado, setPausado, quieto } = useBloqueEnMovimiento<HTMLDivElement>()
  return (
    <SeccionDeLanding id="precios" etiquetadaPor="precios-titulo" tono="frambuesa" interior="pb-6 md:pb-8">
      <div ref={ref}>
        <EncabezadoDeLanding
          id="precios-titulo"
          antetitulo="Precios"
          alineacion="centro"
          titulo={
            <>
              Dos planes. Las <span className="resaltado">mismas funciones.</span>
            </>
          }
          subtitulo="Lo único que cambia es cuántas personas atienden. En pesos chilenos, con IVA incluido."
        />
        <ul className="mt-[26px] flex flex-wrap justify-center gap-3 md:gap-3.5">
          {PILDORAS.map(({ texto, icono: Icono, tono }) => (
            <li
              key={texto}
              className="inline-flex items-center gap-[9px] rounded-full border border-borde bg-tarjeta py-[7px] pl-2 pr-[18px] text-sm font-semibold shadow-sm"
            >
              <span
                aria-hidden="true"
                className={cn("grid size-7 place-items-center rounded-full", CLASES_DE_TONO[tono].suave, CLASES_DE_TONO[tono].texto)}
              >
                <Icono className="size-[15px]" strokeWidth={1.75} />
              </span>
              {texto}
            </li>
          ))}
        </ul>
        <div aria-hidden="true" className="relative mt-4 h-[130px] md:h-[170px]">
          <svg
            viewBox="0 0 1440 170"
            width="1440"
            height="170"
            className="pointer-events-none absolute -left-5 top-0 overflow-visible md:left-1/2 md:-translate-x-1/2"
          >
            <TrazosOndulantes trazos={TRAZOS_DE_PRECIOS} enPausa={quieto} />
          </svg>
        </div>
        <div className="flex justify-end motion-reduce:hidden">
          <BotonDePausa pausado={pausado} alCambiar={setPausado} etiqueta="Pausar las líneas de precios" />
        </div>
      </div>
    </SeccionDeLanding>
  )
}

/** Lo que tienen los dos planes, en una caja pistacho con las líneas suaves abajo. */
function Incluido() {
  const { ref, pausado, setPausado, quieto } = useBloqueEnMovimiento<HTMLElement>()
  return (
    <article
      ref={ref}
      aria-labelledby="incluido-titulo"
      className="relative isolate grid items-center gap-8 overflow-hidden rounded-[40px] bg-pistacho-suave px-5 pb-20 pt-8 squircle md:p-12 md:pb-20 xl:grid-cols-[minmax(0,470px)_minmax(0,1fr)] xl:gap-12 xl:pb-12"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 1296 150"
        width="1296"
        height="150"
        className="pointer-events-none absolute -bottom-6 left-0 -z-10 overflow-visible"
      >
        <TrazosOndulantes trazos={TRAZOS_DE_INCLUIDO} enPausa={quieto} />
      </svg>
      <div>
        <p className="antetitulo-pildora">Incluido en los dos planes</p>
        <h3
          id="incluido-titulo"
          className="mt-4 text-balance text-[2rem] font-medium leading-[1.04] tracking-[-0.045em] md:text-[2.625rem]"
        >
          Todo lo que trae <span className="resaltado [--resaltado-fondo:white]">Eli,</span> sin funciones bloqueadas.
        </h3>
        <p className={cn("mt-4 text-base leading-normal", TEXTO_SOBRE_TINTE)}>
          Prueba {DIAS_DE_PRUEBA} días gratis, sin tarjeta, contados desde que creas tu negocio.
        </p>
        <Boton
          href="/crear-cuenta"
          variante="destacado"
          icono={<ArrowUpRight aria-hidden="true" />}
          className="mt-6 rounded-boton-lg text-sm"
        >
          Crear mi cuenta
        </Boton>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:max-lg:grid-cols-2 lg:max-xl:grid-cols-3 xl:max-[1359px]:grid-cols-2 min-[1360px]:grid-cols-3">
        {FUNCIONES.map((funcion, indice) => {
          const tono = CLASES_DE_TONO[tonoEn(indice)]
          const Icono = funcion.icono
          return (
            <li
              key={funcion.id}
              className="flex items-center gap-3 rounded-[20px] border border-borde-suave bg-tarjeta py-3 pl-3 pr-4 text-[14.5px] font-semibold leading-[1.25] tracking-[-0.01em] shadow-sm squircle"
            >
              <span aria-hidden="true" className={cn("grid size-9 shrink-0 place-items-center rounded-[13px]", tono.suave, tono.texto)}>
                <Icono className="size-[18px]" strokeWidth={1.75} />
              </span>
              {funcion.titulo}
            </li>
          )
        })}
      </ul>
      <div className="absolute bottom-4 right-4 motion-reduce:hidden md:bottom-5 md:right-5">
        <BotonDePausa pausado={pausado} alCambiar={setPausado} etiqueta="Pausar las líneas de lo incluido" />
      </div>
    </article>
  )
}

const CUERPO_DE_PLAN = "flex flex-col rounded-[36px] p-6 transition-shadow duration-400 ease-suave squircle md:p-9"

/** El plan que corresponde según la calculadora: un borde de su color y la sombra de una maqueta. */
const RESALTE = "shadow-maqueta ring-3"

/** Un recuadro blanco dentro de la tarjeta de un plan. */
function Recuadro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mt-3.5 rounded-[24px] bg-tarjeta px-5 py-5 shadow-sm squircle md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.09em] text-texto-2">{titulo}</p>
      {children}
    </div>
  )
}

interface PropsDeCabeceraDePlan {
  id: string
  para: string
  /** El punto y el texto de "para quién", escritos enteros. */
  punto: string
  colorDelPara: string
  nombre: string
  bajada: string
  precio: number
  nota: string
}

function CabeceraDePlan({ id, para, punto, colorDelPara, nombre, bajada, precio, nota }: PropsDeCabeceraDePlan) {
  return (
    <>
      <p className={cn("inline-flex items-center gap-2 text-[13px] font-semibold", colorDelPara)}>
        <span aria-hidden="true" className={cn("size-2 rounded-full", punto)} />
        {para}
      </p>
      <h3 id={id} className="mt-2.5 text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.045em] md:text-[2.625rem]">
        {nombre}
      </h3>
      <p className={cn("mt-3 max-w-[480px] text-base leading-normal", TEXTO_SOBRE_TINTE)}>{bajada}</p>
      <p className="mt-[26px] flex flex-wrap items-baseline gap-x-2">
        <span className="text-[3rem] font-semibold leading-none tracking-[-0.055em] tabular-nums md:text-[3.875rem]">
          {formatearPesos(precio)}
        </span>
        <span className={cn("text-lg", TEXTO_SOBRE_TINTE)}>/mes</span>
      </p>
      <p className={cn("mt-1.5 text-sm", TEXTO_SOBRE_TINTE)}>{nota}</p>
    </>
  )
}

function BotonDePrueba({ className }: { className?: string }) {
  return (
    <Boton
      href="/crear-cuenta"
      variante="destacado"
      icono={<ArrowUpRight aria-hidden="true" />}
      className={cn("mt-[22px] self-start rounded-boton-lg text-sm", className)}
    >
      {TEXTO_DE_PRUEBA}
    </Boton>
  )
}

function TarjetaIndependiente({ resaltada }: { resaltada: boolean }) {
  return (
    <article
      aria-labelledby="independiente-titulo"
      className={cn(CUERPO_DE_PLAN, "bg-frambuesa-suave", resaltada && cn(RESALTE, "ring-frambuesa"))}
    >
      <CabeceraDePlan
        id="independiente-titulo"
        para="Para quien atiende solo"
        punto="bg-frambuesa"
        colorDelPara="text-frambuesa-texto"
        nombre="Independiente"
        bajada="Tu agenda, tu página de reservas, el tablero del día y los reportes. Todo Eli, para ti."
        precio={PRECIO_INDEPENDIENTE}
        nota="IVA incluido"
      />
      <BotonDePrueba />
      <div className="mt-3">
        <Recuadro titulo="Quién atiende">
          <div className="mt-3 flex items-center gap-3.5">
            <Avatar indice={0}>Tú</Avatar>
            <span className="text-[15px] leading-[1.45]">Atiendes y administras todo, sin equipo que coordinar.</span>
          </div>
        </Recuadro>
        <Recuadro titulo="Tu día con Eli">
          <ul className="mt-1">
            {DIA_CON_ELI.map((texto) => (
              <li key={texto} className="flex items-start gap-3 py-[9px] text-[15px] leading-[1.45]">
                <span aria-hidden="true" className="mt-px grid size-[22px] shrink-0 place-items-center rounded-full bg-pistacho text-navy">
                  <Check className="size-[13px]" strokeWidth={1.75} />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </Recuadro>
      </div>
      <p className="mt-auto pt-[22px] text-[14.5px] leading-normal">
        <span className="font-semibold text-frambuesa-texto">¿Sumas a alguien?</span> Te pasas a Equipo y tu agenda, tus
        clientes y tu historial siguen ahí.
      </p>
    </article>
  )
}

/** Un círculo con iniciales, decorativo: el texto de al lado dice lo mismo. El primero ("Tú") va en ciruela lleno. */
function Avatar({ indice, children }: { indice: number; children: ReactNode }) {
  const tono = CLASES_DE_TONO[tonoEn(indice + 3)]
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-[42px] shrink-0 place-items-center rounded-full border-[2.5px] border-white text-[12.5px] font-semibold",
        indice === 0 ? "bg-ciruela text-white" : cn(tono.suave, tono.texto),
        indice > 0 && "-ml-[9px]"
      )}
    >
      {children}
    </span>
  )
}

function TarjetaEquipo({ resaltada }: { resaltada: boolean }) {
  const adicional = formatearPesos(PRECIO_PERSONA_ADICIONAL)
  const iniciales = INICIALES_DE_EJEMPLO.slice(0, PERSONAS_INCLUIDAS_EQUIPO)
  return (
    <article
      aria-labelledby="equipo-titulo"
      className={cn(CUERPO_DE_PLAN, "bg-ciruela-suave", resaltada && cn(RESALTE, "ring-ciruela"))}
    >
      <CabeceraDePlan
        id="equipo-titulo"
        para="Para el negocio con equipo"
        punto="bg-ciruela"
        colorDelPara="text-ciruela"
        nombre="Equipo"
        bajada="Tú, tu encargado y tus profesionales, cada uno con su rol."
        precio={PRECIO_EQUIPO}
        nota={`IVA incluido · ${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden`}
      />
      <p className="mt-3">
        <span className="inline-block rounded-full bg-tarjeta px-3.5 py-1.5 text-[13px] font-semibold text-ciruela">
          +{adicional}/mes por cada persona más
        </span>
      </p>
      <BotonDePrueba />
      <div className="mt-3">
        <Recuadro titulo="Quién atiende">
          <div
            role="img"
            aria-label={`${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden incluidas, y un lugar más por ${adicional} al mes`}
            className="mt-3 flex flex-wrap items-center pl-0.5"
          >
            {iniciales.map((inicial, indice) => (
              <Avatar key={inicial} indice={indice}>
                {inicial}
              </Avatar>
            ))}
            <span
              aria-hidden="true"
              className="-ml-[9px] grid size-[42px] shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-ciruela bg-tarjeta text-[12.5px] font-semibold text-ciruela"
            >
              +1
            </span>
          </div>
          <p className="mt-3 text-[14.5px] leading-[1.45]">
            {PERSONAS_INCLUIDAS_EQUIPO} incluidas. Desde la {ordinal(PERSONAS_INCLUIDAS_EQUIPO + 1)}, {adicional} al mes
            por persona.
          </p>
        </Recuadro>
        <Recuadro titulo="Cada uno con su rol">
          <dl className="mt-0.5">
            {ROLES.map(({ rol, texto, icono: Icono, tono }, orden) => (
              <div key={rol} className={cn("flex items-start gap-3.5 py-3", orden > 0 && "border-t border-borde-suave")}>
                <span
                  aria-hidden="true"
                  className={cn("grid size-9 shrink-0 place-items-center rounded-[13px]", CLASES_DE_TONO[tono].suave, CLASES_DE_TONO[tono].texto)}
                >
                  <Icono className="size-[18px]" strokeWidth={1.75} />
                </span>
                <div>
                  <dt className="text-[15.5px] font-semibold">{rol}</dt>
                  <dd className="mt-0.5 text-sm leading-[1.45] text-texto-2">{texto}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Recuadro>
      </div>
      <p className="mt-auto pt-[22px] text-[14.5px] leading-normal">
        Los cambios en tu equipo se cobran desde el mes siguiente, sin cobros a medio mes.
      </p>
    </article>
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
      className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border-[1.5px] border-navy bg-tarjeta text-navy anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-tarjeta md:size-[54px]"
    >
      <Icono aria-hidden="true" className="size-[22px]" strokeWidth={1.75} />
    </button>
  )
}

function Calculadora({ personas, alCambiar }: { personas: number; alCambiar: (personas: number) => void }) {
  const calculo = calcularPrecio(personas)
  const independiente = calculo.plan === "independiente"
  const etiquetaDePersonas = personas === 1 ? "persona atiende" : "personas atienden"

  return (
    <article
      aria-labelledby="calculadora-titulo"
      className="mt-7 grid items-center gap-6 rounded-[40px] bg-anil-suave px-5 py-8 squircle md:p-12 lg:max-[1359px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-10 min-[1360px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)]"
    >
      {/*
        En tres columnas sólo desde 1360px: antes, el contador no entra entre
        las otras dos. Los escalones son rangos cerrados (`lg:max-[1359px]:`):
        Tailwind escribe `min-[1360px]:` antes que `lg:` y, con los dos
        valiendo a la vez, ganaba el de lg.
      */}
      <div className="lg:max-[1359px]:col-span-2">
        <p className="antetitulo-pildora">Sin sorpresas</p>
        <h3 id="calculadora-titulo" className="mt-4 text-[2rem] font-medium leading-[1.04] tracking-[-0.045em] md:text-[2.5rem]">
          ¿Cuánto pagarías?
        </h3>
        <p className={cn("mt-3.5 text-base leading-normal", TEXTO_SOBRE_TINTE)}>
          Cuentan los profesionales, y tú si atiendes. Los cambios se cobran desde el mes siguiente, sin cobros a medio
          mes.
        </p>
      </div>

      <div className="rounded-[30px] bg-tarjeta px-5 py-7 text-center shadow-sm squircle md:px-[26px]">
        <div className="flex items-center justify-between gap-3">
          <BotonDePaso
            etiqueta="Una persona menos"
            icono={Minus}
            bloqueado={personas <= PERSONAS_MINIMAS}
            alPulsar={() => alCambiar(Math.max(PERSONAS_MINIMAS, personas - 1))}
          />
          <span className="min-w-[100px] text-[4.25rem] font-semibold leading-none tracking-[-0.06em] tabular-nums md:min-w-[120px] md:text-[5.25rem]">
            {personas}
          </span>
          <BotonDePaso
            etiqueta="Una persona más"
            icono={Plus}
            bloqueado={personas >= PERSONAS_MAXIMAS}
            alPulsar={() => alCambiar(Math.min(PERSONAS_MAXIMAS, personas + 1))}
          />
        </div>
        <p className="mt-3 text-base font-semibold text-texto-2">{etiquetaDePersonas}</p>
      </div>

      {/* Lo que cambia con el contador se anuncia entero, empezando por cuántas personas son. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="min-h-[246px] rounded-[30px] bg-tarjeta px-6 py-[26px] shadow-sm squircle md:px-7"
      >
        <p className="sr-only">
          {personas} {etiquetaDePersonas}.
        </p>
        <p className="inline-block rounded-full bg-navy px-3 py-[5px] text-[11.5px] font-semibold uppercase tracking-[0.08em] text-white">
          {independiente ? "Plan Independiente" : "Plan Equipo"}
        </p>
        <ul>
          <li className="flex justify-between gap-4 pb-3 pt-3.5 text-[15px]">
            <span>
              {independiente ? "Independiente, 1 persona" : `Equipo, ${PERSONAS_INCLUIDAS_EQUIPO} personas incluidas`}
            </span>
            <span className="font-semibold tabular-nums">{formatearPesos(calculo.montoBase)}</span>
          </li>
          {calculo.adicionales > 0 && (
            <li className="flex justify-between gap-4 border-t border-borde-suave py-3 text-[15px]">
              <span>
                +{calculo.adicionales} {calculo.adicionales === 1 ? "persona" : "personas"} ×{" "}
                {formatearPesos(PRECIO_PERSONA_ADICIONAL)}
              </span>
              <span className="font-semibold tabular-nums">{formatearPesos(calculo.montoAdicional)}</span>
            </li>
          )}
        </ul>
        <div className="mt-0.5 border-t-[1.5px] border-navy pt-3.5">
          <p className="text-[13px] text-texto-2">Al mes, IVA incluido</p>
          <p className="mt-0.5 text-[2.75rem] font-semibold leading-[1.1] tracking-[-0.05em] tabular-nums">
            {formatearPesos(calculo.total)}
          </p>
        </div>
      </div>
    </article>
  )
}
