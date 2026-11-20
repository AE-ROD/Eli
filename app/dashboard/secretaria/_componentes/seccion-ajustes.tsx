"use client"

import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Save, SlidersHorizontal } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Interruptor } from "@/components/comunes/interruptor"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { guardarAjustes } from "../_datos"
import { leerPresupuestoUsd, presupuestoEnUsd } from "../_formato"
import type { AjustesDeLaSecretaria } from "../_lecturas"

/** El mismo tope que el servidor. */
const LARGO_DE_LAS_REGLAS = 2000

/** El presupuesto como se escribe en el campo: "5" o "5,50". */
function presupuestoComoTexto(centavos: number): string {
  return centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2).replace(".", ",")
}

/**
 * Cómo atiende Eli: encendida, cuánto puede gastar al mes, cuántas respuestas
 * da antes de pasar la conversación a una persona y las reglas propias del
 * negocio. Sólo la dueña la cambia; el encargado la ve.
 */
export function SeccionAjustes({ inicial, editable }: { inicial: AjustesDeLaSecretaria; editable: boolean }) {
  const router = useRouter()
  const idDelTitulo = useId()
  const idDelPresupuesto = useId()
  const idDeTurnos = useId()
  const idDeReglas = useId()
  const [activa, setActiva] = useState(inicial.activa)
  const [presupuesto, setPresupuesto] = useState(presupuestoComoTexto(inicial.presupuestoMensualCentavos))
  const [turnos, setTurnos] = useState(String(inicial.maxTurnos))
  const [reglas, setReglas] = useState(inicial.reglas ?? "")
  const [guardando, setGuardando] = useState(false)
  const enviado = useRef(false)
  const [error, setError] = useState("")
  const [listo, setListo] = useState(false)

  const presupuestoUsd = leerPresupuestoUsd(presupuesto)
  const turnosNumero = /^\d+$/.test(turnos.trim()) ? Number(turnos.trim()) : NaN
  const turnosValidos = Number.isInteger(turnosNumero) && turnosNumero >= 1 && turnosNumero <= 50

  const cambio = () => setListo(false)

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (enviado.current || presupuestoUsd === null || !turnosValidos) return
    enviado.current = true
    setError("")
    setListo(false)
    setGuardando(true)
    const resultado = await guardarAjustes({
      activa,
      maxTurnos: turnosNumero,
      // No se muestra: se conserva el que tenía.
      maxTokens: inicial.maxTokens,
      presupuestoMensualUsd: presupuestoUsd,
      reglas: reglas.trim() || null,
    })
    enviado.current = false
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    setListo(true)
    router.refresh()
  }

  if (!editable) {
    return (
      <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
        <EncabezadoDeTarjeta
          id={idDelTitulo}
          titulo="Ajustes"
          subtitulo="Sólo la dueña del negocio los puede cambiar."
          icono={{ figura: SlidersHorizontal }}
        />
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-texto-2">Estado</dt>
            <dd className="mt-0.5 font-medium text-navy">{inicial.activa ? "Encendida" : "Apagada"}</dd>
          </div>
          <div>
            <dt className="text-texto-2">Presupuesto mensual</dt>
            <dd className="mt-0.5 font-medium text-navy">{presupuestoEnUsd(inicial.presupuestoMensualCentavos)}</dd>
          </div>
          <div>
            <dt className="text-texto-2">Respuestas antes de pasarte la conversación</dt>
            <dd className="mt-0.5 font-medium text-navy">{inicial.maxTurnos}</dd>
          </div>
          <div className="sm:col-span-3">
            <dt className="text-texto-2">Reglas del negocio</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-navy">{inicial.reglas || "Sin reglas propias."}</dd>
          </div>
        </dl>
      </section>
    )
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Ajustes"
        subtitulo="Cómo atiende Eli a tus clientas por WhatsApp."
        icono={{ figura: SlidersHorizontal }}
      />
      <form onSubmit={guardar} className="mt-5 space-y-5">
        <Interruptor
          etiqueta="Eli responde mi WhatsApp"
          descripcion="Apagada, tus clientas no reciben respuesta automática. El simulador funciona igual."
          activo={activa}
          alCambiar={(valor) => {
            setActiva(valor)
            cambio()
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={idDelPresupuesto} className={ETIQUETA}>
              Presupuesto mensual (US$)
            </label>
            <input
              id={idDelPresupuesto}
              inputMode="decimal"
              value={presupuesto}
              onChange={(evento) => {
                setPresupuesto(evento.target.value)
                cambio()
              }}
              aria-invalid={presupuestoUsd === null}
              aria-describedby={`${idDelPresupuesto}-ayuda`}
              className={cn(CAMPO, presupuestoUsd === null && CAMPO_CON_ERROR)}
            />
            {presupuestoUsd === null ? (
              <p id={`${idDelPresupuesto}-ayuda`} className={ERROR_DE_CAMPO}>
                Escribe un monto en dólares, por ejemplo 5 o 7,50.
              </p>
            ) : (
              <p id={`${idDelPresupuesto}-ayuda`} className="mt-1 text-xs text-texto-2">
                Al llegar al 80 % te avisamos; al 100 % Eli se pausa hasta el mes siguiente.
              </p>
            )}
          </div>
          <div>
            <label htmlFor={idDeTurnos} className={ETIQUETA}>
              Respuestas antes de pasarte la conversación
            </label>
            <input
              id={idDeTurnos}
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={turnos}
              onChange={(evento) => {
                setTurnos(evento.target.value)
                cambio()
              }}
              aria-invalid={!turnosValidos}
              aria-describedby={`${idDeTurnos}-ayuda`}
              className={cn(CAMPO, !turnosValidos && CAMPO_CON_ERROR)}
            />
            {turnosValidos ? (
              <p id={`${idDeTurnos}-ayuda`} className="mt-1 text-xs text-texto-2">
                Si la conversación se alarga más, Eli te la pasa a ti.
              </p>
            ) : (
              <p id={`${idDeTurnos}-ayuda`} className={ERROR_DE_CAMPO}>
                Entre 1 y 50.
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={idDeReglas} className={ETIQUETA}>
            Reglas del negocio (opcional)
          </label>
          <textarea
            id={idDeReglas}
            rows={4}
            maxLength={LARGO_DE_LAS_REGLAS}
            value={reglas}
            placeholder="Por ejemplo: no agendar alisados los sábados; si preguntan por precios de novia, pasarme la conversación."
            onChange={(evento) => {
              setReglas(evento.target.value)
              cambio()
            }}
            className={cn(CAMPO, "resize-y")}
          />
          <p className="mt-1 text-xs text-texto-2">
            Lo que Eli debe saber de tu negocio además de tus servicios y horarios. {reglas.length}/{LARGO_DE_LAS_REGLAS}
          </p>
        </div>

        <BotonPrimario
          type="submit"
          tamaño="sm"
          icono={<Save className="h-4 w-4" />}
          cargando={guardando}
          disabled={presupuestoUsd === null || !turnosValidos}
        >
          {listo ? "Guardado" : "Guardar"}
        </BotonPrimario>
        <p role="status" className="sr-only">
          {listo ? "Ajustes guardados" : ""}
        </p>
        {error && <Aviso>{error}</Aviso>}
      </form>
    </section>
  )
}
