"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { Package, RefreshCw } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { formatearPorcentaje, leerComisiones, type DatosDeComisiones } from "../_datos"
import { TarjetaDeMiembro } from "./tarjeta-de-miembro"
import { HistorialDeComisionesTarjeta } from "./historial-de-comisiones"

/**
 * Comisiones (#64): el % de cada profesional, sus excepciones por servicio,
 * el % de los productos (sólo para leer) y el historial de cambios. La
 * pantalla la ve sólo la dueña: la página lo verifica en el servidor y cada
 * endpoint de nuevo.
 */
export function PantallaDeComisiones() {
  const [datos, setDatos] = useState<DatosDeComisiones | null>(null)
  const [error, setError] = useState("")
  const [version, setVersion] = useState(0)

  const cargar = useCallback(async () => {
    const resultado = await leerComisiones()
    if (resultado.ok) {
      setDatos(resultado.datos)
      setError("")
    } else setError(resultado.error)
  }, [])

  useEffect(() => {
    let vigente = true
    leerComisiones().then((resultado) => {
      if (!vigente) return
      if (resultado.ok) {
        setDatos(resultado.datos)
        setError("")
      } else setError(resultado.error)
    })
    return () => {
      vigente = false
    }
  }, [])

  const alCambiar = () => {
    setVersion((previa) => previa + 1)
    cargar()
  }

  if (!datos) {
    return error ? (
      <Aviso
        accion={
          <Boton variante="secundario" tamano="sm" onClick={cargar}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
            Reintentar
          </Boton>
        }
      >
        {error}
      </Aviso>
    ) : (
      <div role="status" className="space-y-4">
        <span className="sr-only">Cargando las comisiones…</span>
        {[0, 1].map((tarjeta) => (
          <div key={tarjeta} aria-hidden="true" className={cn(TARJETA_DEL_PANEL, "space-y-4 p-5 sm:p-6")}>
            <Esqueleto className="h-6 w-1/3" />
            <Esqueleto className="w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  const sinConfigurar = datos.miembros.filter((miembro) => miembro.porcentaje === null)

  return (
    <div className="space-y-6">
      {error && <Aviso>{error}</Aviso>}

      {sinConfigurar.length > 0 && (
        <Aviso tono="atencion" rol="status">
          {sinConfigurar.length === 1
            ? `${sinConfigurar[0].nombre} no tiene % por defecto: lo que cobre queda pendiente hasta que se lo pongas.`
            : `${sinConfigurar.length} personas del equipo no tienen % por defecto: lo que cobren queda pendiente hasta que se lo pongas.`}
        </Aviso>
      )}
      {datos.pendientesTruncado && (
        <Aviso tono="atencion" rol="status">
          Hay demasiados servicios pendientes para contarlos de una vez: los números de cada profesional se quedan cortos.
        </Aviso>
      )}

      {datos.miembros.length === 0 ? (
        <EstadoVacio titulo="Sin equipo todavía">
          Cuando invites a alguien desde Equipo, aquí le pones su porcentaje.
        </EstadoVacio>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {datos.miembros.map((miembro) => (
            <TarjetaDeMiembro key={miembro.id} miembro={miembro} servicios={datos.servicios} onCambio={alCambiar} />
          ))}
        </div>
      )}

      <ProductosSoloLectura productos={datos.productos} />

      <HistorialDeComisionesTarjeta
        miembros={datos.miembros.map(({ id, nombre }) => ({ id, nombre }))}
        version={version}
      />
    </div>
  )
}

/** El % de cada producto: se edita en Configuración › Productos, acá sólo se lee. */
function ProductosSoloLectura({ productos }: { productos: DatosDeComisiones["productos"] }) {
  const idDelTitulo = useId()
  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Productos"
        subtitulo="Quien vende un producto se lleva su %. Se cambia en Configuración, en Productos."
        icono={{ figura: Package }}
        accion={
          <Boton href="/dashboard/configuracion" variante="secundario" tamano="sm">
            Editar en Configuración
          </Boton>
        }
      />
      {productos.length === 0 ? (
        <EstadoVacio className="mt-4">Todavía no hay productos en el catálogo.</EstadoVacio>
      ) : (
        <ul className="mt-4 divide-y divide-borde border-y border-borde">
          {productos.map((producto) => (
            <li key={producto.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0 break-words">
                {producto.nombre}
                {!producto.activo && <span className="text-texto-2"> (inactivo)</span>}
              </span>
              <span
                className={cn("shrink-0 tabular-nums", producto.porcentaje === null ? "text-texto-2" : "font-medium")}
              >
                {formatearPorcentaje(producto.porcentaje)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
