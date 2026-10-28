"use client"

import { useState } from "react"
import { CalendarDays, Download, Users } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { Aviso } from "@/components/panel/aviso"
import { comoTexto } from "@/lib/fechas"
import { exportarAtenciones, exportarClientes } from "../_datos"

interface PropsDeModalExportar {
  alCerrar: () => void
}

/** Del primero del mes a hoy, en la fecha del dispositivo. */
function mesEnCurso(): { desde: string; hasta: string } {
  const hoy = new Date()
  return { desde: comoTexto(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: comoTexto(hoy) }
}

/**
 * Descargar planillas: los clientes del negocio, o las atenciones de un
 * rango de días. Las dos salen en CSV para Excel en español (separador `;`).
 * Sólo lo abre quien puede (`puedeImportarExportarClientes`); el servidor lo
 * vuelve a verificar.
 */
export function ModalExportar({ alCerrar }: PropsDeModalExportar) {
  const [rango, setRango] = useState(mesEnCurso)
  const [descargando, setDescargando] = useState<"clientes" | "atenciones" | null>(null)
  const [aviso, setAviso] = useState("")

  const descargar = async (cual: "clientes" | "atenciones") => {
    setAviso("")
    setDescargando(cual)
    const resultado = cual === "clientes" ? await exportarClientes() : await exportarAtenciones(rango.desde, rango.hasta)
    setDescargando(null)
    if (!resultado.ok) setAviso(resultado.error)
  }

  return (
    <MarcoDeModal
      titulo="Exportar a Excel"
      descripcion="Se descarga un archivo CSV que abre Excel o Google Sheets."
      bloqueado={descargando !== null}
      alCerrar={alCerrar}
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-medium text-navy">
            <Users className="size-4" aria-hidden="true" strokeWidth={1.75} />
            Clientes
          </h3>
          <p className="text-sm text-texto-2">Todos los clientes del negocio, con sus datos de contacto y notas.</p>
          <Boton
            type="button"
            variante="secundario"
            className="w-full"
            icono={<Download aria-hidden="true" strokeWidth={1.75} />}
            cargando={descargando === "clientes"}
            onClick={() => descargar("clientes")}
          >
            Descargar clientes
          </Boton>
        </section>

        <section className="space-y-3 border-t border-borde pt-6">
          <h3 className="flex items-center gap-2 font-medium text-navy">
            <CalendarDays className="size-4" aria-hidden="true" strokeWidth={1.75} />
            Atenciones
          </h3>
          <p className="text-sm text-texto-2">
            Cada visita al local entre dos días, con sus servicios, quién atendió y lo cobrado. Hasta un año.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoFormulario
              etiqueta="Desde"
              type="date"
              value={rango.desde}
              onChange={(e) => setRango((previo) => ({ ...previo, desde: e.target.value }))}
            />
            <CampoFormulario
              etiqueta="Hasta"
              type="date"
              value={rango.hasta}
              onChange={(e) => setRango((previo) => ({ ...previo, hasta: e.target.value }))}
            />
          </div>
          <Boton
            type="button"
            variante="secundario"
            className="w-full"
            icono={<Download aria-hidden="true" strokeWidth={1.75} />}
            cargando={descargando === "atenciones"}
            onClick={() => descargar("atenciones")}
          >
            Descargar atenciones
          </Boton>
        </section>

        {aviso && <Aviso>{aviso}</Aviso>}
      </div>
    </MarcoDeModal>
  )
}
