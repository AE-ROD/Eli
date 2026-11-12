"use client"

import { useEffect, useEffectEvent, useState, type ReactNode } from "react"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { SeccionColapsable } from "@/components/panel/seccion-colapsable"
import { vocabularioDe } from "@/lib/vocabulario"
import {
  agruparSecciones,
  anclaDelHash,
  grupoDeAncla,
  gruposAbiertosAlEntrar,
  type AnclaDeConfiguracion,
  type IdDeGrupo,
} from "../_grupos"

/** Una sección de Configuración ya armada por `page.tsx`, con su ancla. */
export interface SeccionDeConfiguracion {
  id: AnclaDeConfiguracion
  /** Lo que `page.tsx` renderiza en el servidor (también las secciones `async`). */
  contenido: ReactNode
}

/**
 * Las secciones de Configuración en grupos que se pliegan (`_grupos.ts`).
 * `page.tsx` sigue consultando y filtrando por rol y rubro en el servidor, y
 * pasa acá sólo las secciones visibles; este componente las reparte, abre el
 * primer grupo y pliega los demás, y se ocupa de las anclas de la URL.
 *
 * Se pueden abrir varios grupos a la vez y no se recuerda cuáles entre
 * visitas. El contenido de un grupo plegado sigue montado (`SeccionColapsable`),
 * así que lo escrito sin guardar no se pierde al plegarlo.
 *
 * Las anclas (`#horario`, `#servicios`, `#sillones`…) llevan acá desde otras
 * pantallas. Como el servidor no ve el hash, el primer render es el mismo para
 * todos; al montarse y ante `hashchange` se abre el grupo del ancla y recién
 * después se desplaza hasta la sección, porque un elemento dentro de un grupo
 * plegado no tiene caja y no se puede desplazar hasta él.
 */
export function GruposDeConfiguracion({ secciones }: { secciones: readonly SeccionDeConfiguracion[] }) {
  const rubro = useRubroDelPanel()
  const grupos = agruparSecciones(secciones, vocabularioDe(rubro).palabras)

  const [abiertos, setAbiertos] = useState<ReadonlySet<IdDeGrupo>>(() => new Set(gruposAbiertosAlEntrar(grupos)))
  // Un objeto nuevo en cada pedido: aunque el ancla sea la misma, se vuelve a desplazar.
  const [destino, setDestino] = useState<{ ancla: string } | null>(null)

  const alternar = (id: IdDeGrupo) =>
    setAbiertos((previos) => {
      const siguientes = new Set(previos)
      if (siguientes.has(id)) siguientes.delete(id)
      else siguientes.add(id)
      return siguientes
    })

  // Lee siempre los grupos de este render sin que el efecto se vuelva a armar (y a
  // desplazar) cada vez que `router.refresh()` trae secciones nuevas tras guardar.
  const abrirElAnclaDeLaUrl = useEffectEvent(() => {
    const ancla = anclaDelHash(window.location.hash)
    const grupo = grupoDeAncla(window.location.hash, grupos)
    if (ancla === null || grupo === null) return
    setAbiertos((previos) => (previos.has(grupo) ? previos : new Set(previos).add(grupo)))
    setDestino({ ancla })
  })

  useEffect(() => {
    const alCambiarElHash = () => abrirElAnclaDeLaUrl()
    alCambiarElHash()
    window.addEventListener("hashchange", alCambiarElHash)
    return () => window.removeEventListener("hashchange", alCambiarElHash)
  }, [])

  // Corre ya con el grupo abierto en el DOM; el cuadro de animación deja asentar el
  // layout, y llega después del desplazamiento que Next intenta (en vano) al navegar.
  useEffect(() => {
    if (!destino) return
    const cuadro = requestAnimationFrame(() => document.getElementById(destino.ancla)?.scrollIntoView())
    return () => cancelAnimationFrame(cuadro)
  }, [destino])

  return (
    <div className="space-y-4">
      {grupos.map((grupo) => (
        <SeccionColapsable
          key={grupo.id}
          titulo={grupo.titulo}
          descripcion={grupo.resumen}
          abierta={abiertos.has(grupo.id)}
          onAlternar={() => alternar(grupo.id)}
          className="space-y-6"
        >
          {grupo.secciones.map((seccion) => (
            <div key={seccion.id} id={seccion.id} className="scroll-mt-24">
              {seccion.contenido}
            </div>
          ))}
        </SeccionColapsable>
      ))}
    </div>
  )
}
