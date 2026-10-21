"use client"

import { Users } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { cn } from "@/lib/utils"
import { TarjetaCliente, type ClienteEnTarjeta } from "./tarjeta-cliente"

interface PropsDeListaClientes {
  clientes: ClienteEnTarjeta[]
  cargando: boolean
  cargandoMas: boolean
  vista: "grid" | "lista"
  total: number
  pagina: number
  paginas: number
  /** El que está abierto en la ficha, para marcar su tarjeta. */
  seleccionadoId?: string
  onSeleccionar: (cliente: ClienteEnTarjeta) => void
  onCargarMas: () => void
}

/**
 * Las columnas salen del ancho de la lista (`@container`) y no del de la
 * ventana: con la ficha de un cliente abierta al lado, la lista se angosta
 * aunque la pantalla sea ancha. Una columna en el teléfono, dos desde 576 px y
 * tres desde 896 px.
 */
const CUADRICULA = "grid grid-cols-1 gap-3 sm:gap-4 @xl:grid-cols-2 @4xl:grid-cols-3"
const LISTA = "space-y-3"

function EsqueletoDeClientes({ vista }: { vista: "grid" | "lista" }) {
  return (
    <div aria-busy="true">
      <span className="sr-only">Cargando clientes...</span>
      <ul aria-hidden="true" className={vista === "grid" ? CUADRICULA : LISTA}>
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="rounded-[24px] bg-tarjeta p-4 shadow-sm squircle">
            <div className="flex items-center gap-3">
              <Esqueleto forma="circulo" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <Esqueleto className="h-3.5 w-2/3" />
                <Esqueleto className="w-1/2" />
              </div>
            </div>
            <Esqueleto className="mt-6 w-4/5" />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ListaClientes({
  clientes,
  cargando,
  cargandoMas,
  vista,
  total,
  pagina,
  paginas,
  seleccionadoId,
  onSeleccionar,
  onCargarMas,
}: PropsDeListaClientes) {
  return (
    <div className="@container">
      {cargando ? (
        <EsqueletoDeClientes vista={vista} />
      ) : clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-panel border-2 border-dashed border-borde px-6 py-12 text-center squircle">
          <CuadroDeIcono icono={Users} color="lila" tamano="lg" />
          <h2 className="mt-2 font-semibold text-navy">No se encontraron clientes</h2>
          <p className="max-w-sm text-sm text-pretty text-texto-2">
            Intenta cambiar los filtros o agrega un nuevo cliente
          </p>
        </div>
      ) : (
        <>
          <ul className={cn(vista === "grid" ? CUADRICULA : LISTA)}>
            {clientes.map((cliente) => (
              <li key={cliente.id} className="min-w-0">
                <TarjetaCliente
                  cliente={cliente}
                  seleccionado={cliente.id === seleccionadoId}
                  onClick={() => onSeleccionar(cliente)}
                />
              </li>
            ))}
          </ul>

          {pagina < paginas && (
            <div className="mt-6 flex justify-center">
              <Boton variante="secundario" cargando={cargandoMas} onClick={onCargarMas}>
                Cargar más ({total - clientes.length} restantes)
              </Boton>
            </div>
          )}
        </>
      )}
    </div>
  )
}
