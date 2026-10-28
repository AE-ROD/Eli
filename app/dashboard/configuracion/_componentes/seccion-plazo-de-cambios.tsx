"use client"

import { useId, useState } from "react"
import { CalendarClock, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { guardarPlazoDeCambios } from "../_datos"

/**
 * "Plazo para cancelar o reagendar (horas)": hasta cuántas horas antes de la
 * cita el cliente puede cancelarla o cambiarla con el enlace de su correo.
 * Después, la página le dice que contacte al local. De 0 a 72; por defecto 24.
 * Sólo dueño y encargado (la página la muestra según `puedeEditarPlazoDeCambios`).
 */
export function SeccionPlazoDeCambios({ horasIniciales }: { horasIniciales: number }) {
  const idDelTitulo = useId()
  const idDelCampo = useId()
  const [texto, setTexto] = useState(String(horasIniciales))
  const [guardadas, setGuardadas] = useState(horasIniciales)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [listo, setListo] = useState(false)

  const horas = Number(texto)
  const valido = texto.trim() !== "" && Number.isInteger(horas) && horas >= 0 && horas <= 72
  const pendiente = valido && horas !== guardadas

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setError("")
    setListo(false)
    if (!valido) return setError("Escribe un número entero de horas, de 0 a 72.")
    setGuardando(true)
    const resultado = await guardarPlazoDeCambios(horas)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    setGuardadas(resultado.datos.horas)
    setListo(true)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Cancelar o reagendar"
        subtitulo="Tus clientes reciben un enlace en el correo de confirmación"
        icono={{ figura: CalendarClock }}
      />
      <form onSubmit={guardar} className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-0 space-y-2">
          <label htmlFor={idDelCampo} className={CLASES_DE_ETIQUETA}>
            Plazo para cancelar o reagendar (horas)
          </label>
          <input
            id={idDelCampo}
            type="number"
            inputMode="numeric"
            min={0}
            max={72}
            step={1}
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value)
              setListo(false)
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
          {listo && !pendiente ? "Guardado" : "Guardar"}
        </BotonPrimario>
      </form>
      <p id={`${idDelCampo}-ayuda`} className="mt-3 text-sm text-texto-2">
        Hasta cuántas horas antes de la cita pueden hacerlo solos, de 0 a 72. Después, el enlace les pide que te
        contacten.
      </p>
      <p role="status" className="sr-only">
        {listo ? "Plazo guardado" : ""}
      </p>
      {error && <Aviso className="mt-4">{error}</Aviso>}
    </section>
  )
}
