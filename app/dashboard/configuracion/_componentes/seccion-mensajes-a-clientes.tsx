"use client"

import { useId, useState } from "react"
import { MailCheck } from "lucide-react"
import { Insignia } from "@/components/comunes/insignia"
import { Interruptor } from "@/components/comunes/interruptor"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { cambiarMensajesAClientes, type EstadoDeMensajes, type InterruptoresDeMensajes } from "../_datos"

/** Cada interruptor con lo que hace, en una línea, como se lo explicaríamos a la dueña. */
const MENSAJES: { campo: keyof InterruptoresDeMensajes; etiqueta: string; descripcion: string }[] = [
  {
    campo: "listaDeEsperaActiva",
    etiqueta: "Lista de espera",
    descripcion: "Si un día no tiene horas, tus clientes se anotan y les avisamos por correo cuando se libere una.",
  },
  {
    campo: "avisoDeVueltaActivo",
    etiqueta: "Te toca volver",
    descripcion: "Un correo cuando a un cliente ya le toca volver, según cada cuánto viene o la frecuencia de su servicio.",
  },
  {
    campo: "pideResenas",
    etiqueta: "Pedir reseña en Google",
    descripcion: "El día después de su visita, un correo con tu enlace de reseñas de Google. A todos por igual.",
  },
]

/** Los tipos de envío (`TIPOS_DE_ENVIO`) como se leen en la tarjeta. */
const TIPOS: { tipo: string; nombre: string }[] = [
  { tipo: "lista-de-espera", nombre: "Avisos de lista de espera" },
  { tipo: "te-toca", nombre: "Te toca volver" },
  { tipo: "resena", nombre: "Pedidos de reseña" },
  { tipo: "contacto-manual", nombre: "Escritos por ti a quienes se están yendo" },
]

/** "2026-10" → "octubre". */
function nombreDelMes(mes: string): string {
  const [año, numero] = mes.split("-").map(Number)
  if (!año || !numero) return "este mes"
  return new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(año, numero - 1, 1)))
}

const numero = (valor: number | undefined) => new Intl.NumberFormat("es-CL").format(valor ?? 0)

/**
 * "Mensajes a clientes" en Configuración: los tres mensajes automáticos
 * (lista de espera, te toca volver, pedir reseña) y lo enviado este mes.
 * Dueña y encargado la ven (`puedeVerMensajesAClientes`); sólo la dueña los
 * enciende o apaga (`puedeActivarMensajesAClientes`), y el encargado ve en qué
 * estado está cada uno. Cada interruptor se guarda al tocarlo; si el servidor
 * lo rechaza (pedir reseña sin enlace), vuelve como estaba y dice por qué.
 */
export function SeccionMensajesAClientes({ inicial }: { inicial: EstadoDeMensajes }) {
  const idDelTitulo = useId()
  const idDelMes = useId()
  const [interruptores, setInterruptores] = useState(inicial.interruptores)
  const [guardando, setGuardando] = useState<keyof InterruptoresDeMensajes | null>(null)
  const [error, setError] = useState("")
  const [anuncio, setAnuncio] = useState("")

  const cambiar = async (campo: keyof InterruptoresDeMensajes, activo: boolean) => {
    if (guardando) return
    const antes = interruptores
    setError("")
    setAnuncio("")
    setGuardando(campo)
    setInterruptores({ ...antes, [campo]: activo })
    const resultado = await cambiarMensajesAClientes({ [campo]: activo })
    setGuardando(null)
    if (!resultado.ok) {
      setInterruptores(antes)
      return setError(resultado.error)
    }
    setInterruptores(resultado.datos.interruptores)
    const etiqueta = MENSAJES.find((mensaje) => mensaje.campo === campo)?.etiqueta ?? ""
    setAnuncio(`${etiqueta}: ${activo ? "encendido" : "apagado"}`)
  }

  const { mes } = inicial

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Mensajes a clientes"
        subtitulo="Correos que Eli manda por ti, sin que tengas que acordarte"
        icono={{ figura: MailCheck }}
      />

      <Aviso tono="info" className="mt-5">
        &ldquo;Te toca volver&rdquo; y &ldquo;Pedir reseña&rdquo; sólo les llegan a quienes aceptaron recibir avisos y
        novedades de tu negocio por correo, y cada correo trae cómo darse de baja. La lista de espera le llega a quien se
        anotó.
      </Aviso>
      {!inicial.puedeCambiar && (
        <Aviso tono="info" className="mt-3">
          Sólo la dueña o el dueño del negocio puede encender o apagar estos mensajes.
        </Aviso>
      )}
      {error && <Aviso className="mt-3">{error}</Aviso>}
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      <ul className="mt-5 divide-y divide-borde">
        {MENSAJES.map((mensaje) => {
          const descripcion =
            mensaje.campo === "pideResenas" && !inicial.tieneEnlaceDeResenas
              ? `${mensaje.descripcion} Antes, agrega tu enlace de reseñas en "Tu página pública".`
              : mensaje.descripcion
          return (
            <li key={mensaje.campo} className="py-4 first:pt-0 last:pb-0">
              {inicial.puedeCambiar ? (
                <Interruptor
                  etiqueta={mensaje.etiqueta}
                  descripcion={descripcion}
                  activo={interruptores[mensaje.campo]}
                  alCambiar={(activo) => cambiar(mensaje.campo, activo)}
                />
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy">{mensaje.etiqueta}</p>
                    <p className="mt-1 text-sm text-texto-2">{descripcion}</p>
                  </div>
                  <Insignia tono={interruptores[mensaje.campo] ? "lima" : "gris"}>
                    {interruptores[mensaje.campo] ? "Encendido" : "Apagado"}
                  </Insignia>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <section aria-labelledby={idDelMes} className="mt-6 rounded-[20px] bg-superficie p-4 squircle sm:p-5">
        <h3 id={idDelMes} className="text-sm font-medium text-navy">
          Mensajes de este mes
        </h3>
        <p className="mt-1 text-[13px] text-texto-2">Lo enviado en {nombreDelMes(mes.mes)}, contando hasta hoy.</p>

        <p className="mt-3 font-serif text-3xl font-medium text-navy">
          {numero(mes.total)}
          <span className="ml-2 font-sans text-sm font-normal text-texto-2">{mes.total === 1 ? "mensaje" : "mensajes"}</span>
        </p>

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {TIPOS.map(({ tipo, nombre }) => (
            <div key={tipo} className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0 text-texto-2">{nombre}</dt>
              <dd className="shrink-0 font-medium text-navy tabular-nums">{numero(mes.porTipo[tipo])}</dd>
            </div>
          ))}
        </dl>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-borde pt-3 text-[13px] text-texto-2">
          <div className="flex gap-1.5">
            <dt>De servicio</dt>
            <dd className="font-medium text-navy tabular-nums">{numero(mes.porCategoria.servicio)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Promocionales</dt>
            <dd className="font-medium text-navy tabular-nums">{numero(mes.porCategoria.promocional)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Por correo</dt>
            <dd className="font-medium text-navy tabular-nums">{numero(mes.porCanal.correo)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Escritos por ti</dt>
            <dd className="font-medium text-navy tabular-nums">{numero(mes.porCanal.manual)}</dd>
          </div>
          {(mes.porCanal.whatsapp ?? 0) > 0 && (
            <div className="flex gap-1.5">
              <dt>Por WhatsApp</dt>
              <dd className="font-medium text-navy tabular-nums">{numero(mes.porCanal.whatsapp)}</dd>
            </div>
          )}
        </dl>
      </section>
    </section>
  )
}
