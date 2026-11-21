"use client"

import type { ReactNode } from "react"
import { Boton } from "@/components/comunes/boton"

interface PropsDeBotonesDelPie {
  /** El `id` del `<form>` que envía el botón principal: en el pie queda fuera de él. */
  formulario: string
  onCancelar: () => void
  guardando: boolean
  /** El principal todavía no se puede usar (faltan datos, los pagos no cuadran). */
  deshabilitado?: boolean
  /** Lo que dice el botón mientras guarda, para el lector de pantalla ("Cobrando"). */
  mientrasGuarda: string
  /** El texto del principal: "Cobrar $25.000", "Anotar en espera". */
  children: ReactNode
}

/**
 * Cancelar y el botón que envía, para la ranura `pie` de `MarcoDeModal`: en el
 * celular quedan fijos al pie de la hoja, a la altura del pulgar, y el que
 * envía arriba; desde `sm`, uno al lado del otro, como siempre.
 *
 * El `escritorio:pt-1` suma 4 px a los 20 que el marco deja antes del pie: en el
 * computador quedan a los mismos 24 px de lo último del formulario
 * (`space-y-6`) que cuando iban adentro.
 */
export function BotonesDelPie({
  formulario,
  onCancelar,
  guardando,
  deshabilitado = false,
  mientrasGuarda,
  children,
}: PropsDeBotonesDelPie) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row escritorio:pt-1">
      <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando} className="w-full">
        Cancelar
      </Boton>
      <Boton
        type="submit"
        form={formulario}
        disabled={deshabilitado}
        cargando={guardando}
        // Mientras guarda, el botón muestra sólo el ícono que gira: el nombre dice qué está haciendo.
        aria-label={guardando ? mientrasGuarda : undefined}
        className="w-full"
      >
        {children}
      </Boton>
    </div>
  )
}
