"use client"

import { useState } from "react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { SelectorDeFoto } from "@/components/panel/selector-de-foto"
import { delRol } from "@/lib/nombres-de-roles"
import { apareceEnLaPagina } from "@/lib/pagina-del-negocio"
import { vocabularioDe } from "@/lib/vocabulario"
import { quitarFotoDelMiembro, subirFotoDelMiembro, type MiembroDelEquipo } from "../_datos"

interface PropsDeModalFotoDelMiembro {
  miembro: MiembroDelEquipo
  alCerrar: () => void
  /** Se llama con la foto nueva (o `null` si se quitó) apenas el servidor la guardó, para que la lista se actualice detrás. */
  alCambiar: (miembroId: string, url: string | null) => void
}

/**
 * La foto de un integrante: subirla, cambiarla o quitarla. La dueña y el
 * encargado cambian la de cualquiera (`puedeEditarFotoDelMiembro`, que la
 * lista pregunta antes de ofrecer el botón). El título dice de quién es con la
 * palabra del rubro: «Foto del barbero», «Foto de la estilista», «Foto del
 * encargado». Se guarda al instante: el botón sólo cierra.
 */
export function ModalFotoDelMiembro({ miembro, alCerrar, alCambiar }: PropsDeModalFotoDelMiembro) {
  const rubro = useRubroDelPanel()
  // "tus pacientes" en una clínica dental.
  const { clientes } = vocabularioDe(rubro)
  const [fotoUrl, setFotoUrl] = useState(miembro.fotoUrl ?? null)
  const primerNombre = miembro.user.name.trim().split(/\s+/)[0] || miembro.user.name

  return (
    <MarcoDeModal
      titulo={`Foto de ${miembro.user.name}`}
      antetitulo="Equipo"
      descripcion={
        apareceEnLaPagina(miembro.role)
          ? `La ven tus ${clientes} en la página de reservas, junto al nombre.`
          : "Se ve en la lista del equipo. En la página de reservas sólo salen quienes atienden."
      }
      alCerrar={alCerrar}
    >
      <div className="space-y-6">
        <SelectorDeFoto
          titulo={`Foto ${delRol(miembro.role, rubro)}`}
          nombreConArticulo={`la foto de ${primerNombre}`}
          forma="circulo"
          url={fotoUrl}
          nombre={miembro.user.name}
          puedeEditar
          onSubir={(foto) => subirFotoDelMiembro(miembro.id, foto)}
          onQuitar={() => quitarFotoDelMiembro(miembro.id)}
          alCambiar={(url) => {
            setFotoUrl(url)
            alCambiar(miembro.id, url)
          }}
        />

        <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={alCerrar}>
          Listo
        </BotonPrimario>
      </div>
    </MarcoDeModal>
  )
}
