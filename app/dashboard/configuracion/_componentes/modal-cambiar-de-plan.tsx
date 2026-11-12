"use client"

import { useId, useRef, useState } from "react"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { nombreDePlan, type PlanId } from "@/lib/planes"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { cambiarDePlan } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"
import { cuerpoDelCambio, type CambioDePlan } from "../_plan"

/** Como en el resto de las opciones: el radio no se ve y el anillo lo dibuja la opción entera. */
const ANILLO_DE_LA_OPCION =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo) has-focus-visible:shadow-[0_0_0_6px_var(--halo)]"

interface PropsDeModalCambiarDePlan {
  /** Qué pasaría: a qué plan, y con qué sedes. Ya evaluado con las sedes de ahora. */
  cambio: CambioDePlan
  /**
   * Se llama con el plan que quedó, cuando el servidor ya lo cambió. Quien lo
   * recibe renueva la sesión y vuelve a pedir la página; el modal sigue
   * «trabajando» hasta que termina.
   */
  alCambiar: (plan: PlanId) => Promise<void>
  alCerrar: () => void
}

/**
 * Confirmar el cambio de plan, con las consecuencias dichas antes de
 * confirmar: a Equipo, que se podrá invitar y que hay una sola sede (con
 * sedes activas, cuál queda como la dirección del negocio y cuántas se
 * desactivan); a Independiente, que se atiende sólo y que se pueden tener
 * sedes. También el precio y que todavía no se cobra. Si el servidor lo
 * rechaza (409), el modal sigue abierto con su motivo.
 */
export function ModalCambiarDePlan({ cambio, alCambiar, alCerrar }: PropsDeModalCambiarDePlan) {
  const palabras = vocabularioDe(useRubroDelPanel()).palabras
  const { plan: frases } = frasesDeConfiguracion(palabras)
  const idDeLaLeyenda = useId()
  const nombreDeGrupo = useId()
  const grupo = useRef<HTMLFieldSetElement>(null)
  const [elegida, setElegida] = useState<string | null>(cambio.sedePorDefecto)
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState("")

  const destino = cambio.destino
  const nombreDelDestino = nombreDePlan(destino)
  const deberiaElegir = cambio.sedesParaElegir.length > 1

  const confirmar = async () => {
    if (trabajando) return
    const cuerpo = cuerpoDelCambio(cambio, elegida)
    if (!cuerpo.ok) {
      setAviso(frases.modal.aEquipo.faltaElegir)
      requestAnimationFrame(() => grupo.current?.querySelector<HTMLInputElement>("input")?.focus())
      return
    }
    setAviso("")
    setTrabajando(true)
    const resultado = await cambiarDePlan(cuerpo.plan, cuerpo.sedeQueSeQueda, palabras)
    if (!resultado.ok) {
      setTrabajando(false)
      return setAviso(resultado.error)
    }
    await alCambiar(resultado.datos.plan)
    setTrabajando(false)
  }

  return (
    <ModalConfirmar
      titulo={frases.modal.titulo(nombreDelDestino)}
      descripcion={frases.modal.descripcion}
      textoConfirmar={frases.modal.confirmar(nombreDelDestino)}
      textoCancelar={frases.modal.cancelar}
      trabajando={trabajando}
      aviso={aviso}
      onConfirmar={confirmar}
      onCerrar={alCerrar}
    >
      <div className="space-y-4 text-sm">
        {destino === "equipo" ? (
          <ul className="list-disc space-y-1.5 pl-5 text-pretty">
            <li>{frases.modal.aEquipo.invitar}</li>
            <li>{frases.modal.aEquipo.unaSede}</li>
            {cambio.sedesParaElegir.length === 0 && <li>{frases.modal.aEquipo.sinSedes}</li>}
            {cambio.sedesParaElegir.length === 1 && <li>{frases.modal.aEquipo.unaSedeQueda(cambio.sedesParaElegir[0].nombre)}</li>}
            {deberiaElegir && <li>{frases.modal.aEquipo.elegirSede}</li>}
            {cambio.sedesQueSeDesactivan > 0 && <li className="font-medium">{frases.modal.aEquipo.seDesactivan(cambio.sedesQueSeDesactivan)}</li>}
          </ul>
        ) : (
          <ul className="list-disc space-y-1.5 pl-5 text-pretty">
            <li>{frases.modal.aIndependiente.atiendesTu}</li>
            <li>{frases.modal.aIndependiente.sedes}</li>
          </ul>
        )}

        {deberiaElegir && (
          <fieldset ref={grupo} aria-describedby={idDeLaLeyenda} className="min-w-0">
            <legend id={idDeLaLeyenda} className={cn(CLASES_DE_ETIQUETA, "mb-1")}>
              {frases.modal.aEquipo.leyenda}
            </legend>
            <div className="mt-2 grid gap-2">
              {cambio.sedesParaElegir.map((sede) => {
                const marcada = elegida === sede.id
                return (
                  <label
                    key={sede.id}
                    className={cn(
                      "relative flex min-h-14 cursor-pointer items-center gap-3 rounded-campo border bg-tarjeta px-4 py-2.5 squircle transition-[border-color] duration-150 ease-suave",
                      ANILLO_DE_LA_OPCION,
                      marcada ? "border-2 border-navy" : "border-texto-2 hover:border-navy"
                    )}
                  >
                    <input
                      type="radio"
                      name={nombreDeGrupo}
                      value={sede.id}
                      checked={marcada}
                      onChange={() => {
                        setElegida(sede.id)
                        setAviso("")
                      }}
                      className="sr-only"
                    />
                    {/* La marca no depende sólo del color: el círculo se rellena. */}
                    <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", marcada ? "border-navy" : "border-texto-2")}>
                      {marcada && <span className="size-2.5 rounded-full bg-navy" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words text-navy">{sede.nombre}</span>
                      <span className="block text-[13px] break-words text-texto-2">
                        {[sede.direccion, sede.comuna].filter(Boolean).join(", ")}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}

        <p className="font-medium text-pretty">{frases.modal.precio(destino, nombreDelDestino)}</p>
        <Aviso tono="info">{frases.cobro}</Aviso>
      </div>
    </ModalConfirmar>
  )
}
