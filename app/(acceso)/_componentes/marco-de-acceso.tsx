"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { HALO_DE_MODULO } from "@/components/comunes/colores-de-modulo"
import { LogoEli } from "@/components/comunes/logo-eli"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import type { ModuloId } from "@/lib/modulos"
import { cn } from "@/lib/utils"

interface PropsDeMarcoDeAcceso {
  antetitulo: string
  /** El `<h1>` de la pantalla, en la serif de los titulares de sección. */
  titulo: ReactNode
  /** Una o dos líneas debajo del título: qué se hace acá. */
  bajada?: ReactNode
  /** Arriba del antetítulo: el indicador de pasos o un ícono en su cuadro. */
  arriba?: ReactNode
  /**
   * El paso o el estado de la pantalla. Cuando cambia (del paso 1 al 2, del
   * formulario a "revisa tu correo") el contenido entra con un fundido y el
   * foco va al título nuevo: lo que tenía el foco, el botón que se apretó, ya
   * no existe, y sin esto el foco caía al `<body>` sin que el lector de
   * pantalla dijera nada.
   */
  clave?: string | number
  /** Mientras lo de adentro todavía está cargando. */
  ocupado?: boolean
  /** El módulo al que se entra: el halo del foco toma su pastel. */
  modulo?: ModuloId
  /** Debajo de la tarjeta: el camino a la pantalla vecina. */
  pie?: ReactNode
  children?: ReactNode
}

/**
 * El marco de las pantallas de acceso: crema, el logo arriba como en la
 * landing, y una tarjeta blanca con el encabezado (antetítulo, título en serif
 * y bajada) y el formulario. La tarjeta queda arriba y no centrada en el alto:
 * así el título no salta cuando un paso es más corto que el otro.
 *
 * Lo primero que se pinta no espera a JavaScript ni se anima: el fundido es
 * sólo para los cambios de paso.
 */
export function MarcoDeAcceso({
  antetitulo,
  titulo,
  bajada,
  arriba,
  clave,
  ocupado = false,
  modulo,
  pie,
  children,
}: PropsDeMarcoDeAcceso) {
  const refDelTitulo = useRef<HTMLHeadingElement>(null)

  // Si la clave cambió alguna vez desde que llegó la página.
  const [claveAnterior, setClaveAnterior] = useState(clave)
  const [cambio, setCambio] = useState(false)
  if (clave !== claveAnterior) {
    setClaveAnterior(clave)
    setCambio(true)
  }

  useEffect(() => {
    if (cambio) refDelTitulo.current?.focus()
  }, [cambio, clave])

  return (
    <div className={cn("flex min-h-dvh flex-col bg-crema text-navy", modulo && HALO_DE_MODULO[modulo])}>
      <header className="contenedor flex h-[68px] shrink-0 items-center pl-4 pr-2 md:h-20 md:px-10">
        <Link
          href="/"
          aria-label="Eli, ir al inicio"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[12px] px-1.5 anillo-foco"
        >
          <LogoEli tamaño="md" />
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center px-2 pb-12 pt-1 md:px-6 md:pb-20 md:pt-6 lg:pt-10">
        <Tarjeta className="w-full max-w-[480px]">
          {/* La clave rearma el contenido: entra entero, con el título nuevo. */}
          <motion.div
            key={clave}
            aria-busy={ocupado || undefined}
            initial={cambio ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: DURACION.pildora, ease: CURVA.fundido }}
            className="px-6 pb-8 pt-9 sm:px-10 sm:pb-10 sm:pt-11"
          >
            {arriba && <div className="mb-6">{arriba}</div>}
            <Antetitulo>{antetitulo}</Antetitulo>
            {/* Recibe el foco por código al cambiar de paso; no es un control, así que no lleva anillo. */}
            <h1 ref={refDelTitulo} tabIndex={-1} className="titulo-seccion mt-3 text-balance break-words outline-none">
              {titulo}
            </h1>
            {bajada && <p className="mt-3 text-pretty break-words text-texto-2">{bajada}</p>}
            {children && <div className="mt-8">{children}</div>}
          </motion.div>
        </Tarjeta>

        {pie && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 px-4 text-center text-sm text-texto-2">
            {pie}
          </div>
        )}
      </main>
    </div>
  )
}

interface PropsDePreguntaConEnlace {
  pregunta: string
  href: string
  /** El texto del enlace. */
  children: ReactNode
}

/** Para el pie del marco: una pregunta y el enlace que la responde ("¿Ya tienes cuenta? Inicia sesión"). */
export function PreguntaConEnlace({ pregunta, href, children }: PropsDePreguntaConEnlace) {
  return (
    <>
      <span>{pregunta}</span>
      <Boton href={href} variante="enlace" tamano="sm" className="text-navy">
        {children}
      </Boton>
    </>
  )
}
