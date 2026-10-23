"use client"

import { CalendarPlus, Download } from "lucide-react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { generarIcs, urlDeGoogleCalendar, type CitaParaCalendario } from "@/lib/calendario"
import { cn } from "@/lib/utils"

/** El nombre del archivo: sin tildes ni símbolos, que algunos sistemas no los guardan bien. */
function nombreDelArchivo(cita: CitaParaCalendario): string {
  const base = `${cita.servicio}-${cita.fecha}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return `${base || "reserva"}.ics`
}

/**
 * Bajar el .ics. Se arma en el navegador, con lo que la pantalla ya sabe de
 * la reserva: no hay otro pedido al servidor. Un `blob:` no es una conexión,
 * así que la CSP (`connect-src 'self'`) no lo frena.
 */
function descargarIcs(cita: CitaParaCalendario) {
  const archivo = new Blob([generarIcs(cita, new Date())], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(archivo)
  const enlace = document.createElement("a")
  enlace.href = url
  enlace.download = nombreDelArchivo(cita)
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Safari todavía lee el archivo después del clic: se suelta un rato después.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * "No te olvides": la reserva al calendario de quien reservó. Google con un
 * enlace (abre su pantalla de guardar, en otra pestaña) y el resto con el .ics.
 */
export function AgregarAlCalendario({ cita, className }: { cita: CitaParaCalendario; className?: string }) {
  return (
    <div className={cn(className)}>
      <Antetitulo>No te olvides</Antetitulo>
      <div className="mt-3 flex flex-col gap-2.5">
        <Boton
          href={urlDeGoogleCalendar(cita)}
          target="_blank"
          rel="noopener noreferrer"
          icono={<CalendarPlus />}
          className="w-full justify-start"
        >
          Agregar a Google Calendar
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </Boton>
        <Boton
          variante="secundario"
          icono={<Download />}
          onClick={() => descargarIcs(cita)}
          className="w-full justify-start"
        >
          iPhone, Outlook y otros (.ics)
        </Boton>
      </div>
      <p className="mt-3.5 text-sm text-pretty text-texto-2">
        Si dejaste tu correo, también te llega un recordatorio el día antes.
      </p>
    </div>
  )
}
