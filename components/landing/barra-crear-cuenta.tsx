"use client"

import { useEffect, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { cn } from "@/lib/utils"

/** El botón principal del inicio: mientras se ve, la barra sobra. */
const BOTON_DEL_INICIO = '#inicio a[href="/crear-cuenta"]'

/** El cierre ("Deja de complicarte") ya trae su botón; si falta, el pie. */
const CIERRE = "#empezar"
const PIE = "footer"

/**
 * Sólo en el teléfono (por debajo de md): una barra fija abajo con "Crear
 * cuenta gratis", para que nunca haya un tramo largo de la página sin un
 * botón para empezar.
 *
 * Aparece cuando el botón principal del inicio ya quedó arriba, fuera de la
 * pantalla, y se esconde en cuanto asoma el cierre (que trae el suyo) o el
 * pie: así nunca hay dos botones iguales a la vista ni tapa el final de la
 * página. Escondida queda `invisible`, fuera del orden del teclado.
 *
 * Mientras se ve, `app/globals.css` le da a la página un `scroll-padding`
 * abajo de su alto: el foco del teclado y las anclas no quedan debajo de ella.
 * Respeta la zona segura de abajo (`env(safe-area-inset-bottom)`).
 */
export function BarraCrearCuenta() {
  const [inicioPasado, setInicioPasado] = useState(false)
  const [cierreCerca, setCierreCerca] = useState(false)
  const visible = inicioPasado && !cierreCerca

  useEffect(() => {
    const boton = document.querySelector(BOTON_DEL_INICIO)
    const cierre = document.querySelector(CIERRE) ?? document.querySelector(PIE)
    const observadores: IntersectionObserver[] = []

    if (boton) {
      const observador = new IntersectionObserver(([entrada]) => {
        // Pasado = no se ve y quedó arriba. Antes de llegar (la página cargada
        // más abajo y vuelta hacia arriba) no cuenta como pasado.
        setInicioPasado(!entrada.isIntersecting && entrada.boundingClientRect.top < 0)
      })
      observador.observe(boton)
      observadores.push(observador)
    }

    if (cierre) {
      const observador = new IntersectionObserver(([entrada]) => {
        // Cerca = asoma por abajo o ya se pasó: desde ahí hasta el final, sin barra.
        setCierreCerca(entrada.isIntersecting || entrada.boundingClientRect.top < 0)
      })
      observador.observe(cierre)
      observadores.push(observador)
    }

    return () => {
      for (const observador of observadores) observador.disconnect()
    }
  }, [])

  return (
    <div
      data-barra-crear-cuenta={visible ? "visible" : "oculta"}
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-[90] border-t border-borde bg-crema/95 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,14,14,0.08)] backdrop-blur-md transition-[translate,visibility] duration-300 ease-suave md:hidden",
        visible ? "visible translate-y-0" : "invisible translate-y-full"
      )}
    >
      <Boton
        href="/crear-cuenta"
        variante="destacado"
        icono={<ArrowUpRight aria-hidden="true" />}
        className="w-full rounded-boton-lg text-base"
      >
        Crear cuenta gratis
      </Boton>
    </div>
  )
}
