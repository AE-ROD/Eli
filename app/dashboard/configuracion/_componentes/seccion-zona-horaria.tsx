"use client"

import { useId, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { Earth, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { ZONAS_DE_CHILE, esZonaDeChile, horaActualEn, zonaDeChilePorId } from "@/lib/zonas-de-chile"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { guardarZonaHoraria } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"

/** Como en el resto de las opciones: el radio no se ve y el anillo lo dibuja la opción entera. */
const ANILLO_DE_LA_OPCION =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo) has-focus-visible:shadow-[0_0_0_6px_var(--halo)]"

/** Cada cuánto se mira si cambió el minuto del reloj. */
const MIRAR_CADA_MS = 15_000

function suscribirseAlReloj(avisar: () => void) {
  const reloj = setInterval(avisar, MIRAR_CADA_MS)
  return () => clearInterval(reloj)
}
const minutoActual = () => Math.floor(Date.now() / 60_000)
/** En el servidor y al hidratar no hay hora que mostrar: el HTML es el mismo para todos. */
const sinReloj = () => null

/**
 * El instante actual al minuto, o `null` hasta que la página se hidrata. Por
 * `useSyncExternalStore`: la pantalla vuelve a dibujarse sólo cuando cambia el
 * minuto, y la hora del servidor no se descuadra con la del navegador.
 */
function useAhora(): Date | null {
  const minuto = useSyncExternalStore(suscribirseAlReloj, minutoActual, sinReloj)
  return minuto === null ? null : new Date(minuto * 60_000)
}

interface PropsDeSeccionZonaHoraria {
  /** La zona con que trabaja hoy el negocio (`zonaVigente`): la guardada, o Santiago si no hay una válida. */
  zonaGuardada: string
}

/**
 * La zona horaria del negocio (`Business.timezone`), sólo para la dueña
 * (`puedeConfigurarZonaHoraria`; `page.tsx` monta la sección con ese permiso).
 * Tres opciones fijas, las de Chile, con la hora que marca el reloj en cada una
 * como pista. Cambiarla pide confirmación: cambia a qué hora se muestran las
 * citas y qué horas ofrece la reserva pública (las citas ya guardadas no se
 * mueven en el tiempo, cambia cómo se leen).
 *
 * El inicio, los reportes y el tablero siguen calculando el día con la zona del
 * dispositivo: esta sección no los cambia.
 */
export function SeccionZonaHoraria({ zonaGuardada }: PropsDeSeccionZonaHoraria) {
  const idDelTitulo = useId()
  const nombreDelGrupo = useId()
  const frases = frasesDeConfiguracion(vocabularioDe(useRubroDelPanel()).palabras).zonaHoraria
  const router = useRouter()
  const ahora = useAhora()

  const [guardada, setGuardada] = useState(zonaGuardada)
  // Una zona guardada que no está en la lista (un dato puesto a mano) no deja ninguna marcada.
  const [elegida, setElegida] = useState<string | null>(esZonaDeChile(zonaGuardada) ? zonaGuardada : null)
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [listo, setListo] = useState(false)

  const pendiente = elegida !== null && elegida !== guardada
  const nombreDe = (id: string) => zonaDeChilePorId(id)?.nombre ?? id

  const confirmar = async () => {
    if (!pendiente || elegida === null) return
    setAvisoDelModal("")
    setGuardando(true)
    const resultado = await guardarZonaHoraria(elegida)
    setGuardando(false)
    // Si el servidor no la acepta, el modal queda abierto con el motivo: cerrarlo haría parecer que se guardó.
    if (!resultado.ok) return setAvisoDelModal(resultado.error)
    setGuardada(resultado.datos.zona)
    setConfirmando(false)
    setListo(true)
    // La cuenta de mensajes del mes y lo demás que el servidor arma con la zona se vuelve a leer.
    router.refresh()
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo="Zona horaria"
        subtitulo={frases.subtitulo}
        icono={{ figura: Earth }}
      />

      {!esZonaDeChile(guardada) && (
        <Aviso tono="atencion" className="mt-5">
          {frases.otraZona(guardada)}
        </Aviso>
      )}

      <fieldset className="mt-5 min-w-0">
        <legend className={cn(CLASES_DE_ETIQUETA, "mb-1")}>{frases.ayuda}</legend>
        <div className="mt-2 grid gap-2">
          {ZONAS_DE_CHILE.map((zona) => {
            const marcada = elegida === zona.id
            return (
              <label
                key={zona.id}
                className={cn(
                  "relative flex min-h-14 cursor-pointer items-center gap-3 rounded-campo border bg-tarjeta px-4 py-2.5 squircle transition-[border-color] duration-150 ease-suave",
                  ANILLO_DE_LA_OPCION,
                  marcada ? "border-navy border-2" : "border-texto-2 hover:border-navy"
                )}
              >
                <input
                  type="radio"
                  name={nombreDelGrupo}
                  value={zona.id}
                  checked={marcada}
                  onChange={() => {
                    setElegida(zona.id)
                    setListo(false)
                  }}
                  className="sr-only"
                />
                {/* La marca no depende sólo del color: el círculo se rellena. */}
                <span
                  aria-hidden="true"
                  className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", marcada ? "border-navy" : "border-texto-2")}
                >
                  {marcada && <span className="size-2.5 rounded-full bg-navy" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-navy">{zona.nombre}</span>
                  <span className="block text-[13px] text-texto-2">{zona.detalle}</span>
                </span>
                {/* La hora de ahora en esa zona, para que se note cuál es la del local. */}
                {ahora && (
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] text-texto-2">Ahora</span>
                    <span className="block text-base font-medium text-navy tabular-nums">{horaActualEn(ahora, zona.id)}</span>
                  </span>
                )}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="mt-5">
        <BotonPrimario
          type="button"
          tamaño="sm"
          icono={<Save className="h-4 w-4" />}
          variante={pendiente ? "primario" : "secundario"}
          disabled={!pendiente}
          onClick={() => {
            setAvisoDelModal("")
            setConfirmando(true)
          }}
        >
          {listo && !pendiente ? "Guardado" : "Guardar"}
        </BotonPrimario>
      </div>
      <p role="status" className="sr-only">
        {listo && !pendiente ? frases.guardado : ""}
      </p>

      <AnimatePresence>
        {confirmando && pendiente && elegida !== null && (
          <ModalConfirmar
            titulo={frases.confirmar.titulo}
            descripcion={frases.confirmar.descripcion}
            textoConfirmar={frases.confirmar.confirmar}
            textoCancelar={frases.confirmar.cancelar}
            trabajando={guardando}
            aviso={avisoDelModal}
            onConfirmar={confirmar}
            onCerrar={() => setConfirmando(false)}
          >
            <p className="text-sm font-medium text-navy">{frases.confirmar.cambio(nombreDe(guardada), nombreDe(elegida))}</p>
          </ModalConfirmar>
        )}
      </AnimatePresence>
    </section>
  )
}
