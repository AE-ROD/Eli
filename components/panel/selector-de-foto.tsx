"use client"

import { useId, useRef, useState, type ChangeEvent, type MouseEvent, type ReactNode } from "react"
import { AnimatePresence } from "framer-motion"
import { CircleAlert, CircleCheck, ImageIcon, LoaderCircle } from "lucide-react"
import { Boton, clasesDeBoton } from "@/components/comunes/boton"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { ImagenConRespaldo } from "@/components/comunes/imagen-con-respaldo"
import { obtenerColorFondo } from "@/components/panel/avatar-usuario"
import { ajustarFoto } from "@/components/panel/ajustar-foto"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { ACCEPT_DE_FOTO, type FormaDeFoto } from "@/lib/ajustar-foto-en-cliente"
import type { ResultadoDeFoto } from "@/lib/enviar-foto"
import { iniciales } from "@/lib/pagina-del-negocio"
import { cn } from "@/lib/utils"

/**
 * El input de archivo no se ve (es `sr-only`), así que el anillo del foco lo
 * dibuja el botón entero cuando el input lo recibe. Es el mismo de las
 * opciones del modal de servicio.
 */
const ANILLO_DEL_BOTON =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo) has-focus-visible:shadow-[0_0_0_6px_var(--halo)]"

type Estado =
  | { tipo: "reposo" }
  | { tipo: "ajustando" }
  | { tipo: "subiendo" }
  | { tipo: "listo"; texto: string }
  | { tipo: "error"; texto: string }

interface PropsDeSelectorDeFoto {
  /** Qué foto es, con su artículo si lo lleva: «Logo», «Portada», «Foto del barbero». También le da nombre a los botones para el lector de pantalla. */
  titulo: string
  /** La foto escrita en medio de una frase: «el logo», «la portada», «la foto de Camila». Es para preguntar «¿Quitar …?». */
  nombreConArticulo: string
  /** Una línea debajo del título: dónde se ve esta foto. */
  ayuda?: ReactNode
  /** `circulo` para una persona o un logo; `banner` para la portada. */
  forma: FormaDeFoto
  /** La foto que hay guardada (una URL del propio sitio), o `null` si no hay. */
  url: string | null
  /** De quién o de qué es: de ahí salen las iniciales que se ven mientras no hay foto. */
  nombre: string
  /**
   * El color de lo que se ve sin foto, como clases de fondo y texto (el color
   * del negocio en el logo y la portada). Sin él, el pastel de las iniciales
   * de esa persona, el mismo del `AvatarUsuario`.
   */
  clasesDelRespaldo?: string
  /** Quien no puede cambiarla ve sólo la imagen o las iniciales, sin botones. */
  puedeEditar: boolean
  /** Sube la foto ya ajustada. La pantalla pone la ruta (`_datos.ts`), esto no conoce URLs. */
  onSubir: (foto: Blob) => Promise<ResultadoDeFoto>
  onQuitar: () => Promise<ResultadoDeFoto>
  /** Se llama con la URL nueva (o `null`) cuando el servidor ya la guardó: la pantalla actualiza su estado. */
  alCambiar: (url: string | null) => void
}

/**
 * Elegir, cambiar o quitar una foto: el logo y la portada del negocio, la foto
 * de cada integrante del equipo. Se guarda al instante, sin botón de guardar.
 *
 * El flujo, en la misma línea de estado que el lector de pantalla anuncia
 * (`aria-live="polite"`): ajustando (el navegador la achica,
 * `components/panel/ajustar-foto.ts`) → subiendo → listo o error con el
 * mensaje del servidor. Mientras trabaja no acepta otra foto. Quitarla pide
 * confirmación (`ModalConfirmar`).
 *
 * Es de presentación: no sabe de quién es la foto ni a qué ruta va; recibe
 * `onSubir` y `onQuitar`. Si la imagen no carga, se ven las iniciales y no un
 * hueco roto.
 */
export function SelectorDeFoto({
  titulo,
  nombreConArticulo,
  ayuda,
  forma,
  url,
  nombre,
  clasesDelRespaldo,
  puedeEditar,
  onSubir,
  onQuitar,
  alCambiar,
}: PropsDeSelectorDeFoto) {
  const idDelTitulo = useId()
  const idDeLaAyuda = useId()
  const entrada = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<Estado>({ tipo: "reposo" })
  const [confirmando, setConfirmando] = useState(false)
  const [quitando, setQuitando] = useState(false)
  const [errorAlQuitar, setErrorAlQuitar] = useState("")

  const ocupado = estado.tipo === "ajustando" || estado.tipo === "subiendo"

  const elegir = async (evento: ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0]
    // Vacío, para que elegir el mismo archivo otra vez (tras un error) vuelva a avisar.
    evento.target.value = ""
    if (!archivo || ocupado) return

    setEstado({ tipo: "ajustando" })
    const ajustada = await ajustarFoto(archivo, forma)
    if (!ajustada.ok) return setEstado({ tipo: "error", texto: ajustada.error })

    setEstado({ tipo: "subiendo" })
    const resultado = await onSubir(ajustada.foto)
    if (!resultado.ok) return setEstado({ tipo: "error", texto: resultado.error })

    setEstado({ tipo: "listo", texto: "Foto guardada." })
    alCambiar(resultado.url)
  }

  /** Mientras trabaja, el input sigue en su lugar (conserva el foco) pero no abre el selector de archivos. */
  const noAbrirSiOcupado = (evento: MouseEvent<HTMLInputElement>) => {
    if (ocupado) evento.preventDefault()
  }

  const pedirQuitar = () => {
    setErrorAlQuitar("")
    setConfirmando(true)
  }

  const confirmarQuitar = async () => {
    if (quitando) return
    setErrorAlQuitar("")
    setQuitando(true)
    const resultado = await onQuitar()
    setQuitando(false)
    if (!resultado.ok) return setErrorAlQuitar(resultado.error)
    setConfirmando(false)
    setEstado({ tipo: "listo", texto: "Foto quitada." })
    alCambiar(null)
  }

  /**
   * "Quitar" desaparece con la foto, y el foco que volvía a él se pierde. Al
   * terminar de salir el modal, pasa al botón de subir otra.
   */
  const devolverElFoco = () => {
    const activo = document.activeElement
    if (!activo || activo === document.body) entrada.current?.focus()
  }

  const clasesDeFondo = clasesDelRespaldo ?? cn(obtenerColorFondo(nombre), "text-navy")
  const descripciones = ayuda ? `${idDelTitulo} ${idDeLaAyuda}` : idDelTitulo

  return (
    <div role="group" aria-labelledby={idDelTitulo} aria-busy={ocupado} className="min-w-0">
      <p id={idDelTitulo} className={CLASES_DE_ETIQUETA}>
        {titulo}
      </p>
      {ayuda && (
        <p id={idDeLaAyuda} className="mt-0.5 text-[13px] text-texto-2">
          {ayuda}
        </p>
      )}

      <div className={cn("mt-3 flex gap-4", forma === "circulo" ? "flex-wrap items-center" : "flex-col")}>
        <VistaDeLaFoto
          forma={forma}
          url={url}
          alt={`${titulo} actual`}
          nombre={nombre}
          clasesDeFondo={clasesDeFondo}
          trabajando={ocupado}
        />

        <div className="min-w-0">
          {puedeEditar && (
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={cn(
                  clasesDeBoton({ variante: "secundario", tamano: "sm" }),
                  "cursor-pointer",
                  ocupado && "cursor-not-allowed opacity-50",
                  ANILLO_DEL_BOTON
                )}
              >
                {url ? "Cambiar foto" : "Subir foto"}
                <input
                  ref={entrada}
                  type="file"
                  accept={ACCEPT_DE_FOTO}
                  className="sr-only"
                  aria-describedby={descripciones}
                  aria-disabled={ocupado || undefined}
                  onClick={noAbrirSiOcupado}
                  onChange={elegir}
                />
              </label>
              {url && (
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  className="text-error hover:text-error"
                  disabled={ocupado}
                  aria-describedby={idDelTitulo}
                  onClick={pedirQuitar}
                >
                  Quitar
                </Boton>
              )}
            </div>
          )}

          {/* Siempre en el árbol: el lector de pantalla sólo anuncia lo que cambia en una región que ya existía. */}
          <div aria-live="polite" aria-atomic="true" className={cn("text-sm", puedeEditar && "mt-2")}>
            <LineaDeEstado estado={estado} />
          </div>
        </div>
      </div>

      <AnimatePresence onExitComplete={devolverElFoco}>
        {confirmando && (
          <ModalConfirmar
            titulo={`¿Quitar ${nombreConArticulo}?`}
            descripcion={
              forma === "circulo"
                ? "En su lugar se muestran las iniciales. Después puedes subir otra cuando quieras."
                : "En su lugar se muestra el color de la página. Después puedes subir otra cuando quieras."
            }
            textoConfirmar="Quitar foto"
            textoCancelar="No quitar"
            peligro
            trabajando={quitando}
            aviso={errorAlQuitar}
            onConfirmar={confirmarQuitar}
            onCerrar={() => setConfirmando(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function LineaDeEstado({ estado }: { estado: Estado }) {
  switch (estado.tipo) {
    case "reposo":
      return null
    case "ajustando":
    case "subiendo":
      return (
        <p className="flex items-center gap-2 text-texto-2">
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {estado.tipo === "ajustando" ? "Preparando la foto..." : "Subiendo la foto..."}
        </p>
      )
    case "listo":
      return (
        <p className="flex items-center gap-2 font-medium text-navy">
          <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
          {estado.texto}
        </p>
      )
    case "error":
      return (
        <p className="flex items-start gap-2 font-medium text-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{estado.texto}</span>
        </p>
      )
  }
}

interface PropsDeVistaDeLaFoto {
  forma: FormaDeFoto
  url: string | null
  alt: string
  nombre: string
  clasesDeFondo: string
  trabajando: boolean
}

/** Cómo se ve la foto: el círculo de una persona o un logo, o el banner de la portada. */
function VistaDeLaFoto({ forma, url, alt, nombre, clasesDeFondo, trabajando }: PropsDeVistaDeLaFoto) {
  const velo = trabajando && (
    <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-navy/40">
      <LoaderCircle className="size-6 animate-spin text-white" />
    </span>
  )

  if (forma === "circulo") {
    const conIniciales = (
      <span aria-hidden="true" className={cn("grid size-full place-items-center text-3xl font-medium select-none", clasesDeFondo)}>
        {iniciales(nombre)}
      </span>
    )
    return (
      <span className="relative block size-24 shrink-0 overflow-hidden rounded-full ring-1 ring-borde">
        {url ? (
          <ImagenConRespaldo src={url} alt={alt} width={96} height={96} className="size-full object-cover" respaldo={conIniciales} />
        ) : (
          conIniciales
        )}
        {velo}
      </span>
    )
  }

  // Sin portada, o si no carga, queda el color liso con un ícono que dice que ahí va una imagen.
  const vacia = (
    <span aria-hidden="true" className="absolute inset-0 grid place-items-center opacity-50">
      <ImageIcon className="size-7" strokeWidth={1.75} />
    </span>
  )
  return (
    <span className={cn("relative block h-28 w-full max-w-md overflow-hidden rounded-[20px] ring-1 ring-borde squircle", clasesDeFondo)}>
      {url ? <ImagenConRespaldo src={url} alt={alt} fill sizes="448px" className="object-cover" respaldo={vacia} /> : vacia}
      {velo}
    </span>
  )
}
