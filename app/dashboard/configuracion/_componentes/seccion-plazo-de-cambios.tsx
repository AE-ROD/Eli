"use client"

import { useId, useState } from "react"
import { CalendarClock, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { CAMPO, TARJETA_DEL_PANEL, RELLENO_DE_TARJETA } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { guardarPlazoDeCambios } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"

/** Las opciones del selector, en horas: lo mismo que se guardaba escrito a mano (0 es sin límite). */
const OPCIONES_DE_HORAS = [0, 2, 12, 24, 48] as const
/** La que se recomienda y viene por defecto. */
const HORAS_RECOMENDADAS = 24

/**
 * "Cancelar o reagendar": hasta cuántas horas antes de la cita el cliente
 * puede cancelarla o cambiarla con el enlace de su correo. Después, la página
 * le dice que contacte al local. Se elige entre unas pocas opciones (sin
 * límite, 2, 12, 24 o 48 horas antes) y se guarda el mismo número de horas
 * que antes se escribía; un plazo guardado que no está entre ellas (de 0 a 72)
 * aparece como una opción más, para no cambiarlo sin querer.
 * Sólo dueño y encargado (la página la muestra según `puedeEditarPlazoDeCambios`).
 */
export function SeccionPlazoDeCambios({ horasIniciales }: { horasIniciales: number }) {
  const idDelTitulo = useId()
  const { plazoDeCambios: frases } = frasesDeConfiguracion(vocabularioDe(useRubroDelPanel()).palabras)
  const idDelCampo = useId()
  const [texto, setTexto] = useState(String(horasIniciales))
  const [guardadas, setGuardadas] = useState(horasIniciales)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [listo, setListo] = useState(false)

  const horas = Number(texto)
  const valido = texto.trim() !== "" && Number.isInteger(horas) && horas >= 0 && horas <= 72
  // Las de siempre, más la guardada si no es una de ellas (un 6 de antes no desaparece).
  const opciones = [...new Set<number>([...OPCIONES_DE_HORAS, guardadas, horasIniciales])].sort((a, b) => a - b)
  const pendiente = valido && horas !== guardadas

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setError("")
    setListo(false)
    if (!valido) return setError("Elige hasta cuándo pueden hacerlo.")
    setGuardando(true)
    const resultado = await guardarPlazoDeCambios(horas)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    setGuardadas(resultado.datos.horas)
    setListo(true)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, RELLENO_DE_TARJETA)}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo="Cancelar o reagendar"
        subtitulo={frases.subtitulo}
        icono={{ figura: CalendarClock }}
      />
      <form onSubmit={guardar} className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-0 space-y-2">
          <label htmlFor={idDelCampo} className={CLASES_DE_ETIQUETA}>
            {frases.etiqueta}
          </label>
          <select
            id={idDelCampo}
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value)
              setListo(false)
            }}
            aria-describedby={`${idDelCampo}-ayuda`}
            className={cn(CAMPO, "w-auto min-w-64")}
          >
            {opciones.map((opcion) => (
              <option key={opcion} value={opcion}>
                {frases.opcion(opcion, opcion === HORAS_RECOMENDADAS)}
              </option>
            ))}
          </select>
        </div>
        <BotonPrimario
          type="submit"
          tamaño="sm"
          icono={<Save className="h-4 w-4" />}
          cargando={guardando}
          variante={pendiente ? "primario" : "secundario"}
        >
          {listo && !pendiente ? "Guardado" : "Guardar"}
        </BotonPrimario>
      </form>
      <p id={`${idDelCampo}-ayuda`} className="mt-3 text-sm text-texto-2">
        {frases.ayuda}
      </p>
      <p role="status" className="sr-only">
        {listo ? "Plazo guardado" : ""}
      </p>
      {error && <Aviso className="mt-4">{error}</Aviso>}
    </section>
  )
}
