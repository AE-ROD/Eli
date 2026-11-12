"use client"

import { useId, useState } from "react"
import { Tag } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { planDeRenombre, type PlanDeRenombre } from "@/lib/lista-de-servicios"
import type { frasesDeConfiguracion } from "../_frases"

type FrasesDeServicios = ReturnType<typeof frasesDeConfiguracion>["servicios"]

/** Lo mismo que `categoriaDeServicio()`: hasta 40 letras. */
const LARGO_MAXIMO_DE_LA_CATEGORIA = 40

/** Un plan que cambia algo: los otros dos (`vacio`, `igual`) no se pueden confirmar. */
export type PlanConfirmable = Exclude<PlanDeRenombre, { tipo: "vacio" } | { tipo: "igual" }>

interface PropsDeModalRenombrarCategoria {
  frases: FrasesDeServicios
  /** Como se muestra hoy, y su clave (`claveDeCategoria`). */
  categoria: string
  clave: string
  /** Cuántos servicios tiene. */
  cantidad: number
  /** Todos los del catálogo: de ahí sale si el nombre nuevo ya existe. */
  servicios: readonly { category?: string | null }[]
  trabajando: boolean
  aviso: string
  alConfirmar: (plan: PlanConfirmable) => void
  alCerrar: () => void
}

/**
 * Renombrar una categoría, que también sirve para unir dos: si el nombre nuevo
 * es el de otra que ya existe, el texto de abajo lo dice con todas las letras
 * (cuántos servicios tiene la otra y que la de ahora deja de existir) y el botón
 * pasa a decir "Unir categorías". El plan se recalcula al escribir y se anuncia.
 */
export function ModalRenombrarCategoria({ frases, categoria, clave, cantidad, servicios, trabajando, aviso, alConfirmar, alCerrar }: PropsDeModalRenombrarCategoria) {
  const idDeLaExplicacion = useId()
  const [valor, setValor] = useState(categoria)
  const f = frases.renombrarCategoria
  const plan = planDeRenombre(servicios, clave, valor)
  const confirmable = plan.tipo !== "vacio" && plan.tipo !== "igual"

  const explicacion =
    plan.tipo === "vacio"
      ? f.plan.vacio
      : plan.tipo === "igual"
        ? f.plan.igual
        : plan.tipo === "corregir"
          ? f.plan.corregir(plan.nuevo)
          : plan.tipo === "renombrar"
            ? f.plan.renombrar(categoria, plan.nuevo)
            : f.plan.unir(categoria, plan.nuevo, plan.conLosDe)

  return (
    <MarcoDeModal titulo={f.titulo} descripcion={f.descripcion(categoria, cantidad)} bloqueado={trabajando} alCerrar={alCerrar}>
      <form
        onSubmit={(evento) => {
          evento.preventDefault()
          if (confirmable) alConfirmar(plan)
        }}
        className="space-y-5"
      >
        <div className="space-y-1.5">
          <CampoFormulario
            etiqueta={f.campo}
            value={valor}
            onChange={(evento) => setValor(evento.target.value)}
            icono={<Tag className="h-4 w-4" />}
            maxLength={LARGO_MAXIMO_DE_LA_CATEGORIA}
            autoComplete="off"
            aria-describedby={idDeLaExplicacion}
            autoFocus
            onFocus={(evento) => evento.target.select()}
          />
          {/* Qué va a pasar con lo escrito, en una región que el lector anuncia al cambiar. */}
          <p id={idDeLaExplicacion} role="status" className="text-sm font-medium break-words">
            {explicacion}
          </p>
        </div>

        {aviso && <Aviso>{aviso}</Aviso>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={alCerrar} disabled={trabajando}>
            {f.cancelar}
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={trabajando} disabled={!confirmable}>
            {plan.tipo === "unir" ? f.confirmarUnir : f.confirmar}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
