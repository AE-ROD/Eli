"use client"

import { useId, useState } from "react"
import { Tag } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { ETIQUETA } from "@/components/panel/estilos"
import { categoriaCanonica } from "@/lib/lista-de-servicios"
import { cn } from "@/lib/utils"
import type { frasesDeConfiguracion } from "../_frases"

type FrasesDeServicios = ReturnType<typeof frasesDeConfiguracion>["servicios"]

/** Lo mismo que `categoriaDeServicio()`: hasta 40 letras. */
const LARGO_MAXIMO_DE_LA_CATEGORIA = 40

interface PropsDeModalCategoriaDeServicios {
  frases: FrasesDeServicios
  /** Cuántos servicios cambian: lo dice la descripción del modal. */
  cantidad: number
  /** Las categorías que ya usa el catálogo, para elegirlas en vez de escribir otra variante. */
  categorias: string[]
  trabajando: boolean
  aviso: string
  /** La categoría ya escrita como la tiene el catálogo; vacía es "sin categoría". */
  alConfirmar: (categoria: string) => void
  alCerrar: () => void
}

/**
 * Cambiar la categoría de los servicios marcados: se elige una de las que ya
 * existen (botones y sugerencias al escribir) o se escribe una nueva. Vacía los
 * deja sin categoría. Es también la confirmación: el botón dice lo que hace y
 * el modal, a cuántos. Si lo escrito es una que ya existe con otras mayúsculas
 * se usa la existente, para no crear una segunda variante.
 */
export function ModalCategoriaDeServicios({ frases, cantidad, categorias, trabajando, aviso, alConfirmar, alCerrar }: PropsDeModalCategoriaDeServicios) {
  const idDeLasCategorias = useId()
  const idDeLaAyuda = useId()
  const [valor, setValor] = useState("")
  const canonica = categoriaCanonica(categorias, valor)
  const usaLaExistente = canonica !== "" && canonica !== valor.trim()
  const f = frases.cambiarCategoria

  return (
    <MarcoDeModal titulo={f.titulo} descripcion={f.descripcion(cantidad)} bloqueado={trabajando} alCerrar={alCerrar}>
      <form
        onSubmit={(evento) => {
          evento.preventDefault()
          alConfirmar(canonica)
        }}
        className="space-y-5"
      >
        <div className="space-y-1.5">
          <CampoFormulario
            etiqueta={f.campo}
            value={valor}
            onChange={(evento) => setValor(evento.target.value)}
            icono={<Tag className="h-4 w-4" />}
            list={idDeLasCategorias}
            maxLength={LARGO_MAXIMO_DE_LA_CATEGORIA}
            autoComplete="off"
            aria-describedby={idDeLaAyuda}
            autoFocus
          />
          <datalist id={idDeLasCategorias}>
            {categorias.map((categoria) => (
              <option key={categoria} value={categoria} />
            ))}
          </datalist>
          <p id={idDeLaAyuda} className="text-sm text-texto-2">
            {f.ayuda}
          </p>
          {/* Se anuncia al escribir: la categoría que se guardará no es exactamente la que se ve en el campo. */}
          <p role="status" className="min-h-5 text-sm font-medium">
            {usaLaExistente ? f.seUsaLaExistente(canonica) : ""}
          </p>
        </div>

        {categorias.length > 0 && (
          <div>
            <p className={ETIQUETA}>{f.existentes}</p>
            <div className="flex flex-wrap gap-2">
              {categorias.map((categoria) => (
                <OpcionDeCategoria key={categoria} elegida={canonica === categoria} alElegir={() => setValor(categoria)}>
                  {categoria}
                </OpcionDeCategoria>
              ))}
              <OpcionDeCategoria elegida={canonica === ""} alElegir={() => setValor("")}>
                {frases.lista.sinCategoria}
              </OpcionDeCategoria>
            </div>
          </div>
        )}

        {aviso && <Aviso>{aviso}</Aviso>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={alCerrar} disabled={trabajando}>
            {f.cancelar}
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={trabajando}>
            {f.confirmar}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}

/** Una categoría para tocar en vez de escribir. Dice cuál está elegida con `aria-pressed` y con el relleno. */
function OpcionDeCategoria({ elegida, alElegir, children }: { elegida: boolean; alElegir: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={elegida}
      onClick={alElegir}
      className={cn(
        "relative h-10 max-w-full rounded-full border px-4 text-sm font-medium break-words anillo-foco after:absolute after:inset-x-0 after:-inset-y-0.5",
        "transition-colors duration-150 ease-suave",
        elegida ? "border-navy bg-navy text-white" : "border-texto-2 bg-tarjeta text-navy hover:border-navy"
      )}
    >
      {children}
    </button>
  )
}
