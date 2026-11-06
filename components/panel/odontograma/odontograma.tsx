"use client"

import { useId, useState, type ReactNode } from "react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import {
  cuadranteDe,
  denticionDe,
  esTipoDePieza,
  hallazgosPorPieza,
  nombreDeCara,
  nombreDePieza,
  nombreDeTipo,
  resumenDelOdontograma,
  textoDeHallazgos,
  type Cara,
  type Denticion,
  type MarcaDelOdontograma,
} from "@/lib/odontograma"
import { cn } from "@/lib/utils"
import { conMayuscula } from "@/lib/vocabulario"
import { Arcada } from "./arcada"
import { COLOR_DE_LAS_DIVISIONES, COLOR_DEL_CONTORNO } from "./colores"
import { carasEnLaCruz, type LugarDeCara } from "./geometria"
import {
  HERRAMIENTAS,
  hallazgosParaLeer,
  marcaDeCara,
  mismasMarcas,
  nombreDeHerramienta,
  tieneMarcaDePieza,
  tocarCara,
  tocarPieza,
  type Herramienta,
} from "./marcas"
import { MuestraDeMarca } from "./muestra"

/** Los botones de la barra y de la dentición: 40px de alto, el ::after los lleva a 44 para el dedo. */
const BOTON_DE_OPCION =
  "relative inline-flex h-10 items-center gap-2 rounded-[14px] border-[1.5px] px-3 text-sm font-medium text-navy squircle anillo-foco transition-colors duration-150 ease-suave after:absolute after:inset-x-0 after:-inset-y-0.5"

/** La pieza que se elige al abrir cada dentición: el primer molar superior derecho. */
const PRIMERA_ELEGIDA: Record<Denticion, number> = { permanente: 16, temporal: 55 }

/** Con qué dentición abre: la temporal sólo si todo lo marcado es temporal. */
function denticionInicial(marcas: readonly MarcaDelOdontograma[]): Denticion {
  return marcas.length > 0 && marcas.every((marca) => denticionDe(marca.pieza) === "temporal") ? "temporal" : "permanente"
}

interface PropsDeOdontograma {
  /** Las marcas que se muestran (las que se están editando, todavía sin guardar). */
  marcas: MarcaDelOdontograma[]
  /** Sin esto el odontograma es de sólo lectura: se elige una pieza, pero no se marca. */
  alCambiar?: (marcas: MarcaDelOdontograma[]) => void
  /** Debajo del título: "Actualizado el … por …". */
  actualizado?: ReactNode
  /** Al pie del resumen: "Generar presupuesto". */
  accionesDelResumen?: ReactNode
  /** Debajo de todo, a lo ancho: lo de guardar. */
  pie?: ReactNode
}

/**
 * El odontograma clínico en arcada (`Ficha.dc.html`): la barra de
 * herramientas, la dentición, la arcada, el panel de la pieza elegida con
 * sus caras, el resumen con los hallazgos por pieza y la leyenda.
 *
 * Controlado: las marcas vienen de afuera y cada toque devuelve la lista
 * nueva con `alCambiar`. Guardar es cosa de quien lo usa. Las reglas de cada
 * toque están en `marcas.ts`; los nombres, el resumen y los hallazgos, en
 * `lib/odontograma.ts`.
 */
export function Odontograma({ marcas, alCambiar, actualizado, accionesDelResumen, pie }: PropsDeOdontograma) {
  const editable = !!alCambiar
  const [denticion, setDenticion] = useState<Denticion>(() => denticionInicial(marcas))
  const [herramienta, setHerramienta] = useState<Herramienta>("caries")
  const [seleccionada, setSeleccionada] = useState(() => PRIMERA_ELEGIDA[denticionInicial(marcas)])
  const [anuncio, setAnuncio] = useState("")
  const idDelTitulo = useId()
  const idDeLaAyuda = useId()
  const idDeLaPieza = useId()
  const idDelResumen = useId()
  const idDeLaHerramienta = useId()

  /** Aplica el cambio y dice cómo quedó la pieza, para quien no la ve. */
  const cambiar = (pieza: number, nuevas: MarcaDelOdontograma[]) => {
    setSeleccionada(pieza)
    if (!alCambiar || mismasMarcas(nuevas, marcas)) return
    alCambiar(nuevas)
    setAnuncio(`Pieza ${pieza}: ${hallazgosParaLeer(pieza, nuevas)}`)
  }

  const alTocarCara = (pieza: number, cara: Cara) => cambiar(pieza, tocarCara(marcas, pieza, cara, herramienta))
  const alTocarPieza = (pieza: number) => cambiar(pieza, tocarPieza(marcas, pieza, herramienta))

  const verDenticion = (otra: Denticion) => {
    if (otra === denticion) return
    setDenticion(otra)
    setSeleccionada(PRIMERA_ELEGIDA[otra])
  }

  /** Una fila de "Hallazgos por pieza": elige esa pieza, y su dentición si es de la otra. */
  const elegirHallazgo = (pieza: number) => {
    setDenticion(denticionDe(pieza))
    setSeleccionada(pieza)
  }

  const resumen = resumenDelOdontograma(marcas)
  const hallazgos = hallazgosPorPieza(marcas)
  const textoDeLaElegida = textoDeHallazgos(seleccionada, marcas)
  const deCara = !esTipoDePieza(herramienta) && herramienta !== "borrar"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "min-w-0 flex-[999_1_640px] p-4 sm:p-6")}>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <Antetitulo>Ficha clínica</Antetitulo>
              <h2 id={idDelTitulo} className={cn(TITULO_DE_TARJETA, "mt-1.5")}>
                Odontograma
              </h2>
              {actualizado && <p className="mt-1 text-sm text-texto-2">{actualizado}</p>}
            </div>
            <div role="group" aria-label="Dentición" className="flex gap-1 rounded-[16px] bg-superficie p-1 squircle">
              {(["permanente", "temporal"] as const).map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  aria-pressed={denticion === opcion}
                  onClick={() => verDenticion(opcion)}
                  className={cn(BOTON_DE_OPCION, "border-transparent", denticion === opcion ? "bg-tarjeta shadow-sm" : "hover:bg-borde")}
                >
                  {opcion === "permanente" ? "Permanente" : "Temporal"}
                </button>
              ))}
            </div>
          </div>

          {editable && (
            <div role="group" aria-labelledby={idDeLaHerramienta} className="mt-5 flex flex-wrap items-center gap-2">
              <span id={idDeLaHerramienta} className="mr-1 antetitulo">
                Herramienta
              </span>
              {HERRAMIENTAS.map(({ id, nombre }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={herramienta === id}
                  onClick={() => setHerramienta(id)}
                  className={cn(
                    BOTON_DE_OPCION,
                    herramienta === id ? "border-navy bg-azul-suave" : "border-borde bg-tarjeta hover:bg-superficie"
                  )}
                >
                  <MuestraDeMarca herramienta={id} />
                  {nombre}
                </button>
              ))}
            </div>
          )}

          <p id={idDeLaAyuda} className="mt-3 text-sm text-pretty text-texto-2">
            {editable
              ? "Toca una cara para marcarla, o el número para la pieza entera. Con el teclado: las flechas recorren las piezas, Enter aplica la herramienta a la pieza y las letras V, M, D, O, I, P y L marcan esa cara."
              : "Toca una pieza para ver sus hallazgos. Con el teclado, las flechas recorren las piezas."}
          </p>

          <div className="mt-4">
            <Arcada
              denticion={denticion}
              marcas={marcas}
              seleccionada={seleccionada}
              editable={editable}
              idDeLaAyuda={idDeLaAyuda}
              alElegir={setSeleccionada}
              alTocarCara={alTocarCara}
              alTocarPieza={alTocarPieza}
            />
          </div>
          {/* Siempre en la página, aunque vacío: una región que aparece con el texto no se anuncia. */}
          <p role="status" className="sr-only">
            {anuncio}
          </p>
        </section>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
          <section aria-labelledby={idDeLaPieza} className={cn(TARJETA_DEL_PANEL, "p-5")}>
            <div className="flex items-center gap-3.5">
              <span
                aria-hidden="true"
                className="grid size-13 shrink-0 place-items-center rounded-[16px] bg-navy text-xl font-semibold text-white tabular-nums squircle"
              >
                {seleccionada}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-texto-2 uppercase">Pieza seleccionada</p>
                <h3 id={idDeLaPieza} className="mt-0.5 text-[17px] leading-snug font-semibold text-balance">
                  <span className="sr-only">Pieza {seleccionada}, </span>
                  {nombreDePieza(seleccionada)}
                </h3>
                <p className="mt-0.5 text-sm text-texto-2">
                  Cuadrante {cuadranteDe(seleccionada)} · Dentición {denticionDe(seleccionada)}
                </p>
              </div>
            </div>
            <p className="mt-3.5 border-t border-borde pt-3 text-sm leading-relaxed">
              {textoDeLaElegida || "Sin hallazgos: pieza sana."}
            </p>

            {editable && (
              <CarasDeLaPieza
                pieza={seleccionada}
                marcas={marcas}
                herramienta={herramienta}
                deCara={deCara}
                alTocarCara={(cara) => alTocarCara(seleccionada, cara)}
                alTocarPieza={() => alTocarPieza(seleccionada)}
              />
            )}
          </section>

          <section aria-labelledby={idDelResumen} className={cn(TARJETA_DEL_PANEL, "p-5")}>
            <h2 id={idDelResumen} className={TITULO_DE_TARJETA}>
              Resumen
            </h2>
            <dl className="mt-3.5 grid grid-cols-2 gap-2">
              <Cifra valor={resumen.carasConCaries} texto="Caras con caries" color="text-error" />
              <Cifra valor={resumen.carasObturadas} texto="Caras obturadas" color="text-[#2b4c9b]" />
              <Cifra valor={resumen.piezasAusentes} texto="Piezas ausentes" />
              <Cifra valor={resumen.porExtraer} texto="Por extraer" color="text-error" />
            </dl>

            <h3 className="mt-5 text-[11px] font-semibold tracking-[0.08em] text-texto-2 uppercase">Hallazgos por pieza</h3>
            {hallazgos.length === 0 ? (
              <p className="mt-2 text-sm text-texto-2">Sin hallazgos marcados.</p>
            ) : (
              <ul className="relative mt-2 max-h-66 overflow-y-auto">
                {hallazgos.map(({ pieza, texto }) => (
                  <li key={pieza}>
                    <button
                      type="button"
                      aria-current={pieza === seleccionada ? "true" : undefined}
                      onClick={() => elegirHallazgo(pieza)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2.5 rounded-[10px] border-b border-[#f0ede6] px-1.5 py-1.5 text-left text-sm anillo-foco",
                        pieza === seleccionada ? "bg-lila-suave" : "hover:bg-superficie"
                      )}
                    >
                      <span className="grid h-6 min-w-[30px] shrink-0 place-items-center rounded-[8px] bg-[#e9eef2] text-xs font-semibold tabular-nums">
                        <span className="sr-only">Pieza </span>
                        {pieza}
                      </span>
                      <span>
                        <span className="sr-only">: </span>
                        {texto}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {accionesDelResumen && <div className="mt-4">{accionesDelResumen}</div>}
          </section>

          <Leyenda />
        </div>
      </div>

      {pie}
    </div>
  )
}

function Cifra({ valor, texto, color }: { valor: number; texto: string; color?: string }) {
  return (
    // En columna invertida (la cifra arriba, el texto debajo; en el DOM, primero el texto) `justify-end` las junta arriba.
    <div className="flex flex-col-reverse justify-end rounded-[16px] bg-superficie px-3.5 py-3 squircle">
      <dt className="mt-0.5 text-[13px]">{texto}</dt>
      <dd className={cn("text-2xl font-semibold tabular-nums", color)}>{valor}</dd>
    </div>
  )
}

/** Dónde va cada cara en la cruz: arriba, en el medio y abajo. */
const CRUZ: readonly (LugarDeCara | null)[] = [null, "afuera", null, "izquierda", "centro", "derecha", null, "adentro", null]

interface PropsDeCarasDeLaPieza {
  pieza: number
  marcas: readonly MarcaDelOdontograma[]
  herramienta: Herramienta
  /** Si la herramienta es de cara (caries, obturación, sellante). */
  deCara: boolean
  alTocarCara: (cara: Cara) => void
  alTocarPieza: () => void
}

/**
 * Las cinco caras de la pieza elegida como botones, en cruz (vestibular
 * arriba, palatina o lingual abajo, oclusal o incisal al medio): es lo que
 * deja marcar una cara con el teclado o el lector de pantalla, sin apuntar a
 * un trapecio de pocos píxeles. Cada botón dice la cara y lo que tiene.
 * Debajo, la herramienta de pieza aplicada a la pieza entera.
 */
function CarasDeLaPieza({ pieza, marcas, herramienta, deCara, alTocarCara, alTocarPieza }: PropsDeCarasDeLaPieza) {
  const idDeLaIndicacion = useId()
  const cruz = carasEnLaCruz(pieza)
  const nombre = nombreDeHerramienta(herramienta)

  return (
    <div className="mt-4">
      <p id={idDeLaIndicacion} className="text-sm text-texto-2">
        {deCara
          ? `Toca una cara para marcarle ${nombre.toLocaleLowerCase("es-CL")}; de nuevo, para sacarla.`
          : herramienta === "borrar"
            ? "Toca una cara para borrar lo que tiene."
            : `${nombre}: se marca en la pieza entera.`}
      </p>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {CRUZ.map((lugar, indice) => {
          if (!lugar) return <span key={indice} aria-hidden="true" />
          const cara = cruz[lugar]
          const marca = marcaDeCara(marcas, pieza, cara)
          return (
            <button
              key={lugar}
              type="button"
              onClick={() => alTocarCara(cara)}
              aria-describedby={idDeLaIndicacion}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[12px] border-[1.5px] border-texto-2 bg-tarjeta px-1 py-1.5 text-center text-[13px] squircle anillo-foco hover:bg-superficie"
            >
              <span className="font-medium">{conMayuscula(nombreDeCara(cara))}</span>
              <span className="flex items-center gap-1 text-xs text-texto-2">
                {marca && <MuestraDeMarca herramienta={marca} className="size-2.5" />}
                <span className="sr-only">: </span>
                {marca ? nombreDeTipo(marca) : "Sana"}
              </span>
            </button>
          )
        })}
      </div>
      {!deCara && (
        <button
          type="button"
          onClick={alTocarPieza}
          aria-pressed={herramienta === "borrar" ? undefined : esTipoDePieza(herramienta) && tieneMarcaDePieza(marcas, pieza, herramienta)}
          className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-navy px-3 text-sm font-medium squircle anillo-foco hover:bg-navy/6"
        >
          <MuestraDeMarca herramienta={herramienta} />
          {herramienta === "borrar"
            ? `Borrar todo en la pieza ${pieza}`
            : esTipoDePieza(herramienta) && tieneMarcaDePieza(marcas, pieza, herramienta)
              ? `Sacar ${nombre.toLocaleLowerCase("es-CL")} de la pieza ${pieza}`
              : `Marcar ${nombre.toLocaleLowerCase("es-CL")} en la pieza ${pieza}`}
        </button>
      )}
    </div>
  )
}

/** Cómo leer cada pieza y qué es cada marca, en palabras: el color nunca es la única pista. */
function Leyenda() {
  const idDelTitulo = useId()
  const MARCAS: readonly { herramienta: Herramienta; texto: string }[] = [
    { herramienta: "caries", texto: "Caries: la cara en rojo" },
    { herramienta: "obturacion", texto: "Obturación: la cara en azul" },
    { herramienta: "sellante", texto: "Sellante: la cara en verde azulado, con rayas" },
    { herramienta: "corona", texto: "Corona: un contorno ámbar alrededor de la pieza" },
    { herramienta: "endodoncia", texto: "Endodoncia: un triángulo morado del lado de la raíz" },
    { herramienta: "ausente", texto: "Ausente: una X gris" },
    { herramienta: "extraccion", texto: "Extracción indicada: una X roja" },
  ]

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5")}>
      <h2 id={idDelTitulo} className="font-semibold">
        Cómo leer cada pieza
      </h2>
      <div className="mt-3 flex items-center gap-3.5">
        <svg width="48" height="48" viewBox="0 0 100 100" aria-hidden="true" className="shrink-0">
          <rect x="3" y="3" width="94" height="94" rx="22" fill="#ffffff" stroke={COLOR_DEL_CONTORNO} strokeWidth="5" />
          <rect x="30" y="30" width="40" height="40" rx="6" fill="none" stroke={COLOR_DE_LAS_DIVISIONES} strokeWidth="4" />
          <path d="M10 10 30 30M90 10 70 30M10 90 30 70M90 90 70 70" stroke={COLOR_DE_LAS_DIVISIONES} strokeWidth="4" />
        </svg>
        <p className="text-[13px] leading-relaxed">
          <strong className="font-semibold">Borde exterior:</strong> vestibular
          <br />
          <strong className="font-semibold">Borde interior:</strong> palatina o lingual
          <br />
          <strong className="font-semibold">Centro:</strong> oclusal o incisal · <strong className="font-semibold">lados:</strong> mesial
          (hacia la línea media) y distal
        </p>
      </div>
      <ul className="mt-4 space-y-2 text-[13px]">
        {MARCAS.map(({ herramienta, texto }) => (
          <li key={herramienta} className="flex items-center gap-2.5">
            <MuestraDeMarca herramienta={herramienta} />
            {texto}
          </li>
        ))}
        <li className="flex items-center gap-2.5">
          <span aria-hidden="true" className="w-3 shrink-0 text-center text-[11px] font-semibold">
            ( )
          </span>
          Número entre paréntesis: tercer molar
        </li>
      </ul>
    </section>
  )
}
