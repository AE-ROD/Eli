import { Esqueleto } from "@/components/comunes/esqueleto"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"

/**
 * Lo que se ve al cambiar de pantalla del panel mientras llega la siguiente:
 * la barra lateral ya está (la monta el layout) y en su lugar un esqueleto con
 * la forma de cualquier pantalla (encabezado y tarjetas), para que el clic
 * responda en el acto y nada salte cuando llegue.
 *
 * Los bloques son decorativos (`Esqueleto` es invisible al lector de pantalla);
 * lo que el lector oye es el texto de `role="status"`, y `aria-busy` marca la
 * zona como en carga. Con "reducir movimiento" el brillo queda quieto.
 */
export default function CargandoElPanel() {
  return (
    <div aria-busy="true" className="min-h-dvh">
      <p role="status" className="sr-only">
        Cargando…
      </p>

      {/* El sitio de la fila fija del teléfono (`BarraSuperior`): 44 px de botón y 8 de relleno por lado. */}
      <div aria-hidden="true" className="px-2 pt-2 lg:hidden">
        <div className="h-15 rounded-[24px] bg-tarjeta shadow-sm squircle" />
      </div>

      <div aria-hidden="true" className="px-4 pt-5 sm:px-6 lg:pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-x-6">
          <div className="min-w-0 flex-1 space-y-3">
            <Esqueleto className="h-3 w-24" />
            <Esqueleto className="h-9 w-3/4 max-w-72" />
          </div>
          <Esqueleto className="h-11 w-full rounded-boton sm:w-40" />
        </div>
      </div>

      <div aria-hidden="true" className="space-y-4 px-4 pt-6 pb-10 sm:space-y-6 sm:px-6">
        <div className={cn(TARJETA_DEL_PANEL, "space-y-4 p-5 sm:p-6")}>
          <Esqueleto className="h-5 w-1/3" />
          <Esqueleto />
          <Esqueleto className="w-2/3" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          {[0, 1].map((tarjeta) => (
            <div key={tarjeta} className={cn(TARJETA_DEL_PANEL, "space-y-4 p-5 sm:p-6")}>
              <Esqueleto className="h-5 w-1/2" />
              <Esqueleto />
              <Esqueleto className="w-3/4" />
              <Esqueleto className="w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
