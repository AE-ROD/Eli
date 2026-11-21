"use client"

import { PruebaReservar } from "./prueba-reservar"
import { QueResolver } from "./que-resolver"

/**
 * "Toca y mira": la landing en el teléfono (por debajo de md, 768px) cuenta
 * el producto así, en lugar de "Cómo funciona", "Un día", "Tablero" y
 * "Reportes": la persona elige qué le duele y ve sólo eso, y después prueba
 * reservar como su clienta. Desde md no se ve (cada sección lleva `md:hidden`)
 * y la landing sigue con las cuatro secciones de siempre.
 */
export function TocaYMira() {
  return (
    <>
      <QueResolver />
      <PruebaReservar />
    </>
  )
}
