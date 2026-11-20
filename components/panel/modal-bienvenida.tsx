"use client"

import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Check, Clock, Copy, Link2, MessageCircle, QrCode, Scissors, Share2 } from "lucide-react"
import { compartirConElSistema, usePuedeCompartir } from "@/app/dashboard/_componentes/compartir-enlace"
import { Boton } from "@/components/comunes/boton"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { frasesDelPanel } from "@/components/panel/frases-del-panel"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { pasosDeBienvenida, type PasoDeBienvenida } from "@/components/panel/pasos-de-bienvenida"
import { enlaceDeWhatsApp, marcarEnlaceCompartido, mensajeParaCompartir, pasosDeInicioPara } from "@/lib/lista-de-inicio"
import { actorDeSesion, veElPanelDeSuDia } from "@/lib/permisos"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"

const STORAGE_KEY = "eli_onboarding_completado"

/**
 * Los pasos, con las palabras del rubro (`frasesDelPanel`): "tus clientes" o,
 * en una clínica dental, "tus pacientes"; "servicios" o "prestaciones". La
 * acción de cada paso ("Definir horario", "Agregar servicios") es la misma de
 * la lista de inicio (`pasosDeInicioPara`); la del enlace es compartirlo, y se
 * arma abajo porque depende del navegador.
 */
const pasosPara = (rubro: string | null) => {
  const { bienvenida } = frasesDelPanel(vocabularioDe(rubro).palabras)
  const accionDe = (id: "horario" | "servicios") => {
    const paso = pasosDeInicioPara(rubro).find((p) => p.id === id)
    return paso ? paso.accion : null
  }
  return [
    {
      id: "horario" as PasoDeBienvenida,
      icono: Clock,
      titulo: bienvenida.horario.titulo,
      descripcion: bienvenida.horario.descripcion,
      accion: accionDe("horario"),
    },
    {
      id: "servicios" as PasoDeBienvenida,
      icono: Scissors,
      titulo: bienvenida.servicios.titulo,
      descripcion: bienvenida.servicios.descripcion,
      accion: accionDe("servicios"),
    },
    {
      id: "enlace" as PasoDeBienvenida,
      icono: Link2,
      titulo: bienvenida.enlace.titulo,
      descripcion: bienvenida.enlace.descripcion,
      accion: null,
    },
  ]
}

const AFUERA = { target: "_blank", rel: "noopener noreferrer" } as const

interface PropsDeModalBienvenida {
  nombreNegocio: string
  slug: string
  /** Si copiar o compartir el enlace cuenta para la lista de inicio (sólo el dueño la tiene). */
  marcarAlCopiar?: boolean
}

/**
 * Los primeros pasos, la primera vez que se entra al panel: horario,
 * servicios y el enlace de reservas, sólo los que el rol puede hacer
 * (`pasosDeBienvenida`: al profesional no se le piden los servicios). Es un
 * diálogo (`MarcoDeModal`): se
 * anuncia con su título, el foco no sale y Escape lo cierra. Cerrarlo de
 * cualquier forma lo da por visto.
 *
 * El botón principal de cada paso es hacerlo ("Definir horario", "Agregar
 * servicios", "Compartir enlace"); "Siguiente" y "Después" quedan al lado,
 * como secundarios. Al cambiar de paso el foco se queda en "Siguiente", para
 * seguir con Enter; el paso nuevo se anuncia al lector de pantalla.
 */
export function ModalBienvenida({ nombreNegocio, slug, marcarAlCopiar = false }: PropsDeModalBienvenida) {
  const [visible, setVisible] = useState(false)
  const [paso, setPaso] = useState(0)
  const [cambioDePaso, setCambioDePaso] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [noSeCopio, setNoSeCopio] = useState(false)
  const [noSeCompartio, setNoSeCompartio] = useState(false)
  const refBotonSiguiente = useRef<HTMLButtonElement>(null)
  const enfocarElSiguiente = useRef(false)
  const { data: sesion, status: estadoDeLaSesion } = useSession()
  const rubro = useRubroDelPanel()
  const actor = actorDeSesion(sesion)
  const queHace = pasosDeBienvenida(actor)
  const pasos = pasosPara(rubro).filter((paso) => queHace.includes(paso.id))
  const puedeCompartir = usePuedeCompartir()
  // El QR vive en el inicio del dueño y del encargado; el profesional ve su día, sin QR.
  const hayQr = actor !== null && !veElPanelDeSuDia(actor)

  const enlace = typeof window !== "undefined" ? `${window.location.origin}/reservar/${slug}` : `/reservar/${slug}`
  const mensaje = mensajeParaCompartir(rubro, enlace)

  useEffect(() => {
    const completado = localStorage.getItem(STORAGE_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only available client-side, can't read during SSR render
    if (!completado) setVisible(true)
  }, [])

  // "Atrás" no existe en el primer paso: si era lo que tenía el foco, el foco
  // pasa a "Siguiente" en vez de caer al <body>.
  useEffect(() => {
    if (!enfocarElSiguiente.current) return
    enfocarElSiguiente.current = false
    refBotonSiguiente.current?.focus()
  }, [paso])

  const cerrar = () => {
    localStorage.setItem(STORAGE_KEY, "1")
    setVisible(false)
  }

  const copiar = async () => {
    // El portapapeles puede negarse: se dice, y el enlace queda escrito para copiarlo a mano.
    try {
      await navigator.clipboard.writeText(enlace)
    } catch {
      setCopiado(false)
      setNoSeCopio(true)
      return
    }
    setNoSeCopio(false)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
    marcarCompartido()
  }

  // Sin esperarla: si falla, el enlace ya salió.
  const marcarCompartido = () => {
    if (marcarAlCopiar) void marcarEnlaceCompartido()
  }

  const compartir = async () => {
    setNoSeCompartio(false)
    const resultado = await compartirConElSistema(mensaje)
    if (resultado === "compartido") marcarCompartido()
    if (resultado === "fallo") setNoSeCompartio(true)
  }

  const irAlPaso = (nuevo: number) => {
    if (nuevo === 0) enfocarElSiguiente.current = true
    setCambioDePaso(true)
    setPaso(nuevo)
  }

  // Mientras no se sabe quién entra (la sesión no llegó), no se abre: los pasos dependen del rol.
  const pasoActual = pasos[Math.min(paso, pasos.length - 1)]
  const esElUltimo = paso >= pasos.length - 1
  const listo = estadoDeLaSesion !== "loading" && pasoActual !== undefined

  return (
    <AnimatePresence>
      {visible && listo && (
        <MarcoDeModal
          titulo={`¡Bienvenido a Eli, ${nombreNegocio}!`}
          antetitulo={`Paso ${paso + 1} de ${pasos.length}`}
          alCerrar={cerrar}
          pie={
            /*
              El principal es hacer el paso; "Siguiente" (o "Después", en el
              último) lo deja para más tarde. En el teléfono, fijos al pie de la
              hoja: el principal arriba y de ancho completo, y "Atrás" y
              "Siguiente" de a dos debajo. `lg:pt-3`: en el computador, los 32
              px de antes entre el paso y los botones.
            */
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3 lg:pt-3">
              {paso > 0 ? (
                <Boton variante="fantasma" onClick={() => irAlPaso(paso - 1)} className="w-full sm:mr-auto sm:w-auto">
                  Atrás
                </Boton>
              ) : (
                <span aria-hidden="true" className="hidden sm:mr-auto sm:block" />
              )}
              <Boton
                ref={refBotonSiguiente}
                variante="secundario"
                onClick={esElUltimo ? cerrar : () => irAlPaso(paso + 1)}
                className={cn("w-full sm:w-auto", paso === 0 && "col-span-2")}
              >
                {esElUltimo ? "Después" : "Siguiente"}
              </Boton>
              {pasoActual.accion ? (
                <Boton href={pasoActual.accion.href} onClick={cerrar} icono={<ArrowRight />} className="col-span-2 -order-1 w-full sm:order-none sm:w-auto">
                  {pasoActual.accion.texto}
                </Boton>
              ) : puedeCompartir ? (
                <Boton onClick={compartir} icono={<Share2 />} className="col-span-2 -order-1 w-full sm:order-none sm:w-auto">
                  Compartir enlace
                </Boton>
              ) : (
                <Boton
                  href={enlaceDeWhatsApp(mensaje)}
                  {...AFUERA}
                  onClick={marcarCompartido}
                  icono={<MessageCircle />}
                  className="col-span-2 -order-1 w-full sm:order-none sm:w-auto"
                >
                  Compartir por WhatsApp
                  <span className="sr-only"> (se abre en otra pestaña)</span>
                </Boton>
              )}
            </div>
          }
        >
          {/* El avance ya lo dice el antetítulo: las barras son para el ojo. */}
          <div aria-hidden="true" className="-mt-2 mb-7 flex gap-1.5">
            {pasos.map((_, indice) => (
              <span
                key={indice}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-300 ease-suave",
                  indice <= paso ? "bg-navy" : "bg-borde"
                )}
              />
            ))}
          </div>

          <p aria-live="polite" className="sr-only">
            {cambioDePaso ? `Paso ${paso + 1} de ${pasos.length}: ${pasoActual.titulo}` : ""}
          </p>

          {/* La clave rearma el paso: entra con un fundido corto, sin desplazarse. */}
          <motion.div
            key={paso}
            initial={cambioDePaso ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: DURACION.sombra, ease: CURVA.fundido }}
          >
            <CuadroDeIcono icono={pasoActual.icono} color="azul" tamano="lg" />
            <h3 className="mt-4 text-lg leading-snug font-semibold">{pasoActual.titulo}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-pretty text-texto-2">{pasoActual.descripcion}</p>

            {esElUltimo && (
              <div className="mt-5">
                <div className="flex items-center gap-2 rounded-campo bg-superficie py-1.5 pr-1.5 pl-3.5 squircle">
                  <p className={cn("min-w-0 flex-1 font-mono text-sm", noSeCopio ? "break-all select-all" : "truncate")} title={enlace}>
                    {enlace}
                  </p>
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={copiar}
                    icono={copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  >
                    {copiado ? "Copiado" : "Copiar"}
                  </Boton>
                </div>
                <p role="status" className={noSeCopio || noSeCompartio ? "mt-2 text-sm text-texto-2" : "sr-only"}>
                  {copiado
                    ? "Enlace copiado"
                    : noSeCopio
                      ? "No se pudo copiar. Selecciona el enlace y cópialo a mano."
                      : noSeCompartio
                        ? "No se pudo abrir Compartir en este navegador. Usa WhatsApp o copia el enlace."
                        : ""}
                </p>
                {/* Las otras formas: WhatsApp (si el principal es la hoja del sistema) y el QR del local. */}
                {(puedeCompartir || hayQr) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {puedeCompartir && (
                      <Boton
                        href={enlaceDeWhatsApp(mensaje)}
                        {...AFUERA}
                        onClick={marcarCompartido}
                        variante="secundario"
                        tamano="sm"
                        icono={<MessageCircle />}
                      >
                        Enviar por WhatsApp
                        <span className="sr-only"> (se abre en otra pestaña)</span>
                      </Boton>
                    )}
                    {hayQr && (
                      <Boton href="/dashboard#qr-del-local" onClick={cerrar} variante="secundario" tamano="sm" icono={<QrCode />}>
                        Ver QR
                      </Boton>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>

        </MarcoDeModal>
      )}
    </AnimatePresence>
  )
}
