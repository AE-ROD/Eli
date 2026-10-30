"use client"

import { useId, useState } from "react"
import { Save, UserCheck } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Interruptor } from "@/components/comunes/interruptor"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { pedir, conJson, type Resultado } from "@/lib/peticiones"
import {
  DIAS_EN_QUE_CUENTAN_LAS_FALTAS,
  FALTAS_PARA_CONFIRMAR_MAXIMO,
  FALTAS_PARA_CONFIRMAR_MINIMO,
} from "@/lib/por-confirmar"
import { cn } from "@/lib/utils"

/** Con cuántas faltas se propone al encenderlo por primera vez. */
const FALTAS_SUGERIDAS = 2

function guardarPorConfirmar(faltas: number | null): Promise<Resultado<{ faltas: number | null }>> {
  return pedir<{ faltas: number | null }>(
    "/api/configuracion/por-confirmar",
    "No se pudo guardar",
    conJson("PUT", { faltas })
  )
}

/**
 * Reservas por confirmar (#84): con la regla encendida, una reserva de la
 * página pública de alguien que faltó N veces o más en el último año entra
 * "por confirmar", y la confirma o cancela la dueña o el encargado desde la
 * agenda. Quien reserva ve lo mismo que cualquiera; su correo le dice que el
 * local la confirmará. El interruptor se guarda al tocarlo; el número, con
 * "Guardar".
 */
export function FormularioPorConfirmar({ faltasIniciales }: { faltasIniciales: number | null }) {
  const idDelTitulo = useId()
  const idDelCampo = useId()
  const [guardadas, setGuardadas] = useState<number | null>(faltasIniciales)
  const [texto, setTexto] = useState(String(faltasIniciales ?? FALTAS_SUGERIDAS))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [anuncio, setAnuncio] = useState("")

  const encendido = guardadas !== null
  const faltas = Number(texto)
  const valido =
    texto.trim() !== "" &&
    Number.isInteger(faltas) &&
    faltas >= FALTAS_PARA_CONFIRMAR_MINIMO &&
    faltas <= FALTAS_PARA_CONFIRMAR_MAXIMO
  const pendiente = encendido && valido && faltas !== guardadas

  const guardar = async (nuevas: number | null) => {
    if (guardando) return
    setError("")
    setAnuncio("")
    setGuardando(true)
    const resultado = await guardarPorConfirmar(nuevas)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    setGuardadas(resultado.datos.faltas)
    if (resultado.datos.faltas !== null) setTexto(String(resultado.datos.faltas))
    setAnuncio(resultado.datos.faltas === null ? "Reservas por confirmar: apagado" : "Reservas por confirmar: guardado")
  }

  const cambiarInterruptor = (activo: boolean) => {
    if (!activo) return guardar(null)
    guardar(valido ? faltas : FALTAS_SUGERIDAS)
  }

  const guardarNumero = (evento: React.FormEvent) => {
    evento.preventDefault()
    if (!valido) {
      return setError(
        `Escribe un número entero de faltas, de ${FALTAS_PARA_CONFIRMAR_MINIMO} a ${FALTAS_PARA_CONFIRMAR_MAXIMO}.`
      )
    }
    guardar(faltas)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Reservas por confirmar"
        subtitulo="Para quienes reservan y no llegan"
        icono={{ figura: UserCheck }}
      />

      <div className="mt-5">
        <Interruptor
          etiqueta="Pedir confirmación tras faltas"
          descripcion={`Si quien reserva por tu página faltó varias veces en el último año (${DIAS_EN_QUE_CUENTAN_LAS_FALTAS} días), la reserva entra "por confirmar" y tú o tu encargado la confirman o cancelan en la agenda. A esa persona le avisamos por correo que confirmarás su reserva; la página no le dice nada distinto.`}
          activo={encendido}
          alCambiar={cambiarInterruptor}
        />
      </div>

      {encendido && (
        <form onSubmit={guardarNumero} className="mt-5 flex flex-wrap items-end gap-3">
          <div className="min-w-0 space-y-2">
            <label htmlFor={idDelCampo} className={CLASES_DE_ETIQUETA}>
              Faltas para pedir confirmación
            </label>
            <input
              id={idDelCampo}
              type="number"
              inputMode="numeric"
              min={FALTAS_PARA_CONFIRMAR_MINIMO}
              max={FALTAS_PARA_CONFIRMAR_MAXIMO}
              step={1}
              value={texto}
              onChange={(evento) => {
                setTexto(evento.target.value)
                setAnuncio("")
              }}
              aria-describedby={`${idDelCampo}-ayuda`}
              className={cn(CAMPO, "w-32")}
            />
          </div>
          <BotonPrimario
            type="submit"
            tamaño="sm"
            icono={<Save className="h-4 w-4" />}
            cargando={guardando}
            variante={pendiente ? "primario" : "secundario"}
          >
            {pendiente || !valido ? "Guardar" : "Guardado"}
          </BotonPrimario>
          <p id={`${idDelCampo}-ayuda`} className="w-full text-sm text-texto-2">
            Cuentan las citas marcadas &ldquo;No vino&rdquo; con el mismo correo o teléfono, de{" "}
            {FALTAS_PARA_CONFIRMAR_MINIMO} a {FALTAS_PARA_CONFIRMAR_MAXIMO}.
          </p>
        </form>
      )}

      <p role="status" className="sr-only">
        {anuncio}
      </p>
      {error && <Aviso className="mt-4">{error}</Aviso>}
    </section>
  )
}
