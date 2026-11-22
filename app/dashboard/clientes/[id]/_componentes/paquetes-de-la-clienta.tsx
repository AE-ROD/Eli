"use client"

import { useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import { Boton } from "@/components/comunes/boton"
import { CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { formatearMonto } from "@/lib/dinero"
import { MEDIOS_DE_PAGO, esMedioDePago, type MedioDePagoId } from "@/lib/medios-de-pago"
import { TEXTO_DEL_ESTADO, textoDelSaldo, type EstadoDelPaquete } from "@/lib/paquetes"
import { cn } from "@/lib/utils"
import { devolverPaquete, leerPaquetes, type PaqueteDeLaFicha, type PaquetesDeLaFichaRespuesta } from "../_datos"
import { fechaCorta, textoDeLaDevolucion } from "../_formato"

/** El mismo bloque blanco de la ficha de la clienta (`panel-detalle-cliente.tsx`). */
const BLOQUE = "rounded-[24px] bg-tarjeta p-4 shadow-sm squircle"

/** El estado se dice con palabras; el color sólo acompaña. */
const COLOR_DEL_ESTADO: Record<EstadoDelPaquete, string> = {
  activo: "bg-navy text-white",
  agotado: "bg-borde text-navy",
  vencido: "bg-naranja-suave text-navy",
  devuelto: "bg-borde text-navy",
  anulado: "bg-borde text-navy",
}

interface PropsDePaquetesDeLaClienta {
  clienteId: string
  /** La zona horaria del negocio: las fechas se leen en su día. */
  zona: string
}

/**
 * Los paquetes de sesiones de la clienta ("Le quedan 4 de 6"), en su ficha.
 * Se piden solos al abrirla. Si no tiene ninguno, si quien mira no los ve
 * (clínica dental) o si no se pudieron leer, no se muestra nada: ni título ni
 * estado vacío.
 *
 * La dueña ve además "Devolver" en los que tienen sesiones por usar: abre una
 * confirmación que dice cuánto se devuelve y pide el medio. El servidor lo
 * vuelve a verificar todo; acá sólo se decide qué se ve.
 */
export function PaquetesDeLaClienta({ clienteId, zona }: PropsDePaquetesDeLaClienta) {
  const idDelTitulo = useId()
  const idDelMedio = useId()
  const [leido, setLeido] = useState<({ clienteId: string } & PaquetesDeLaFichaRespuesta) | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [porDevolver, setPorDevolver] = useState<PaqueteDeLaFicha | null>(null)
  const [medio, setMedio] = useState<MedioDePagoId>(MEDIOS_DE_PAGO[0].id)
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState("")

  useEffect(() => {
    let vigente = true
    leerPaquetes(clienteId).then((resultado) => {
      if (!vigente) return
      setLeido(resultado.ok ? { clienteId, ...resultado.datos } : null)
    })
    return () => {
      vigente = false
    }
  }, [clienteId, recarga])

  // Lo leído de otra clienta no se muestra mientras llega lo de ésta.
  const datos = leido?.clienteId === clienteId ? leido : null
  if (!datos || datos.paquetes.length === 0) return null

  const abrirDevolucion = (paquete: PaqueteDeLaFicha) => {
    setAviso("")
    setMedio(MEDIOS_DE_PAGO[0].id)
    setPorDevolver(paquete)
  }

  const confirmar = async () => {
    if (!porDevolver || trabajando) return
    setTrabajando(true)
    setAviso("")
    const resultado = await devolverPaquete(clienteId, porDevolver.id, medio)
    setTrabajando(false)
    if (!resultado.ok) {
      setAviso(resultado.error)
      return
    }
    setPorDevolver(null)
    setRecarga((n) => n + 1)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={BLOQUE}>
      <h3 id={idDelTitulo} className="font-semibold">
        Paquetes
      </h3>
      <ul className="mt-3 space-y-4">
        {datos.paquetes.map((paquete) => (
          <li key={paquete.id} className="border-t border-borde pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-medium break-words">{paquete.servicio}</p>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", COLOR_DEL_ESTADO[paquete.estado])}>
                {TEXTO_DEL_ESTADO[paquete.estado]}
              </span>
            </div>
            <p className="mt-1 text-sm tabular-nums">{textoDelSaldo(paquete.sesiones, paquete.usadas)}</p>
            <Progreso sesiones={paquete.sesiones} usadas={paquete.usadas} />
            <p className="mt-2 text-xs text-texto-2 tabular-nums">
              Comprado el {fechaCorta(paquete.vendidoEl, zona)}
              {paquete.venceEl && paquete.estado !== "devuelto" && ` · ${paquete.estado === "vencido" ? "Venció" : "Vence"} el ${fechaCorta(paquete.venceEl, zona)}`}
              {paquete.precio !== null && ` · ${formatearMonto(paquete.precio)}`}
            </p>
            {paquete.estado === "devuelto" && paquete.devueltoEl && (
              <p className="mt-0.5 text-xs text-texto-2 tabular-nums">
                Devuelto el {fechaCorta(paquete.devueltoEl, zona)}
                {paquete.devuelto !== null && `: ${formatearMonto(paquete.devuelto)}`}
              </p>
            )}
            {datos.puedeDevolver && paquete.aDevolver !== null && (
              <Boton type="button" variante="secundario" tamano="sm" className="mt-3 max-escritorio:w-full" onClick={() => abrirDevolucion(paquete)}>
                Devolver
              </Boton>
            )}
          </li>
        ))}
      </ul>

      {/* En el <body>: la ficha del celular es un diálogo propio, y el modal no debe quedar adentro de ella. */}
      {porDevolver &&
        createPortal(
          <ModalConfirmar
            titulo={`Devolver el paquete de ${porDevolver.servicio}`}
            descripcion={textoDeLaDevolucion(porDevolver)}
            textoConfirmar="Devolver"
            textoCancelar="Cancelar"
            peligro
            trabajando={trabajando}
            aviso={aviso}
            onConfirmar={confirmar}
            onCerrar={() => setPorDevolver(null)}
          >
            <div>
              <label htmlFor={idDelMedio} className={ETIQUETA}>
                ¿Cómo se devuelve la plata?
              </label>
              {/* 16px de letra en el celular: con menos, el teléfono acerca la pantalla al tocar el campo. */}
              <select
                id={idDelMedio}
                value={medio}
                disabled={trabajando}
                onChange={(evento) => {
                  if (esMedioDePago(evento.target.value)) setMedio(evento.target.value)
                }}
                className={cn(CAMPO, "max-escritorio:text-base")}
              >
                {MEDIOS_DE_PAGO.map((opcion) => (
                  <option key={opcion.id} value={opcion.id}>
                    {opcion.nombre}
                  </option>
                ))}
              </select>
            </div>
          </ModalConfirmar>,
          document.body
        )}
    </section>
  )
}

/** Un punto por sesión (lleno: usada); con muchas sesiones, una barrita. El texto de arriba ya lo dice: esto es sólo un dibujo. */
function Progreso({ sesiones, usadas }: { sesiones: number; usadas: number }) {
  const hechas = Math.min(sesiones, Math.max(0, usadas))
  if (sesiones > 12) {
    return (
      <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-borde">
        <div className="h-full rounded-full bg-navy" style={{ width: `${(hechas / sesiones) * 100}%` }} />
      </div>
    )
  }
  return (
    <div aria-hidden="true" className="mt-2 flex flex-wrap gap-1.5">
      {Array.from({ length: sesiones }, (_, i) => (
        <span key={i} className={cn("size-2.5 rounded-full", i < hechas ? "bg-navy" : "bg-borde")} />
      ))}
    </div>
  )
}
