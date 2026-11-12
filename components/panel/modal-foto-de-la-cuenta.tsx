"use client"

import { useState } from "react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { quitarFotoDeLaCuenta, subirFotoDeLaCuenta } from "@/components/panel/datos-de-la-cuenta"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { SelectorDeFoto } from "@/components/panel/selector-de-foto"

interface PropsDeModalFotoDeLaCuenta {
  /** El nombre de la persona: de ahí salen las iniciales que se ven mientras no hay foto. */
  nombre: string
  /** La foto que hay guardada (una ruta del propio sitio), o `null` si no hay. */
  fotoUrl: string | null
  alCerrar: () => void
  /** Se llama con la foto nueva (o `null` si se quitó) apenas el servidor la guardó: el panel se vuelve a leer para que el avatar cambie. */
  alCambiar: (url: string | null) => void
}

/**
 * "Mi foto": subir, cambiar o quitar la foto de TU cuenta. Es de la persona y
 * no de un negocio: la sigue en todos sus negocios y sólo ella la ve, en el
 * avatar del panel. No se publica en la página de reservas, y no es la foto del
 * equipo que ve quien reserva (esa se cambia aparte, desde Equipo o
 * Configuración); tampoco hace de respaldo de ella. Se guarda al instante: el
 * botón sólo cierra.
 *
 * Sin palabras del rubro: lo que dice vale igual para cualquier negocio.
 */
export function ModalFotoDeLaCuenta({ nombre, fotoUrl: inicial, alCerrar, alCambiar }: PropsDeModalFotoDeLaCuenta) {
  const [fotoUrl, setFotoUrl] = useState(inicial)

  return (
    <MarcoDeModal
      titulo="Mi foto"
      antetitulo="Tu cuenta"
      descripcion="Es la foto de tu cuenta: sigue contigo en todos tus negocios y solo la ves tú, en el panel. No se publica en la página de reservas."
      alCerrar={alCerrar}
    >
      <div className="space-y-6">
        <SelectorDeFoto
          titulo="Tu foto"
          nombreConArticulo="tu foto"
          forma="circulo"
          url={fotoUrl}
          nombre={nombre}
          puedeEditar
          onSubir={subirFotoDeLaCuenta}
          onQuitar={quitarFotoDeLaCuenta}
          alCambiar={(url) => {
            setFotoUrl(url)
            alCambiar(url)
          }}
        />

        <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={alCerrar}>
          Listo
        </BotonPrimario>
      </div>
    </MarcoDeModal>
  )
}
