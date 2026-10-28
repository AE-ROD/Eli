import type { ReactNode, Ref } from "react"
import { Antetitulo } from "@/components/comunes/antetitulo"

interface PropsDeEncabezadoDeReserva {
  antetitulo: string
  /** El `<h1>` de la página: el nombre del negocio, o lo que pasó al confirmar. */
  titulo: ReactNode
  bajada?: ReactNode
  /**
   * Para llevarle el foco cuando la pantalla cambia entera (la reserva
   * confirmada). Con `ref`, el título se puede enfocar desde el código pero
   * no entra en el orden del Tab.
   */
  ref?: Ref<HTMLHeadingElement>
  /**
   * `1` (por defecto) cuando es el título de la página; `2` cuando la mini
   * página del negocio ya lleva el `<h1>` con su nombre arriba.
   */
  nivel?: 1 | 2
}

/**
 * El encabezado de la página de reservas: antetítulo, titular en serif y
 * bajada, centrados. Lleva `<h1>` y no el `<h2>` de `EncabezadoDeSeccion`
 * porque es el título de la página, no el de una sección.
 *
 * La página es del negocio: el titular es su nombre y no hay logo ni
 * encabezado de la landing arriba. Eli firma abajo, discreto, con `PieDeEli`
 * en todas las pantallas, y en la confirmación invita a probarlo
 * (`InvitacionAEli`).
 */
export function EncabezadoDeReserva({ antetitulo, titulo, bajada, ref, nivel = 1 }: PropsDeEncabezadoDeReserva) {
  const Titulo = nivel === 1 ? "h1" : "h2"
  return (
    <header className="flex flex-col items-center px-3 text-center sm:px-0">
      <Antetitulo>{antetitulo}</Antetitulo>
      <Titulo
        ref={ref}
        tabIndex={ref ? -1 : undefined}
        // Un nombre de negocio de una sola palabra larga no se sale en el teléfono.
        className="titulo-seccion mt-3 max-w-[640px] text-balance break-words text-navy outline-none"
      >
        {titulo}
      </Titulo>
      {bajada && <p className="cuerpo-xl mt-4 max-w-[560px] text-pretty text-texto-2">{bajada}</p>}
    </header>
  )
}
