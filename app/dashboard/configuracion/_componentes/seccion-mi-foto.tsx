"use client"

import { useId, useState } from "react"
import { Camera } from "lucide-react"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { SelectorDeFoto } from "@/components/panel/selector-de-foto"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { quitarFotoDelMiembro, subirFotoDelMiembro } from "../../equipo/_datos"
import { frasesDeConfiguracion } from "../_frases"

interface PropsDeSeccionMiFoto {
  /** El id de la membresía de quien mira (el `memberId` de su sesión): la foto es de ese integrante. */
  miembroId: string
  nombre: string
  fotoInicial: string | null
  /** Si la foto sale en la página de reservas (`apareceEnLaPagina`): sólo para quienes atienden. */
  apareceEnLaPagina: boolean
}

/**
 * "Mi foto": cada integrante del equipo sube la suya. Es el único lugar donde
 * el profesional puede hacerlo: él no ve la pantalla Equipo (dueña y encargado
 * sí cambian la de cualquiera desde ahí). `page.tsx` monta esta sección sólo
 * si `puedeEditarFotoDelMiembro` dice que sí; la dueña, que no es del equipo,
 * no la tiene. Se guarda al instante.
 */
export function SeccionMiFoto({ miembroId, nombre, fotoInicial, apareceEnLaPagina }: PropsDeSeccionMiFoto) {
  const idDelTitulo = useId()
  // "tus pacientes" en una clínica dental.
  const { miFoto: frases } = frasesDeConfiguracion(vocabularioDe(useRubroDelPanel()).palabras)
  const [fotoUrl, setFotoUrl] = useState(fotoInicial)

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo="Mi foto"
        subtitulo={frases.subtitulo(apareceEnLaPagina)}
        icono={{ figura: Camera }}
      />

      <div className="mt-5">
        <SelectorDeFoto
          titulo="Tu foto"
          nombreConArticulo="tu foto"
          forma="circulo"
          url={fotoUrl}
          nombre={nombre}
          puedeEditar
          onSubir={(foto) => subirFotoDelMiembro(miembroId, foto)}
          onQuitar={() => quitarFotoDelMiembro(miembroId)}
          alCambiar={setFotoUrl}
        />
      </div>
    </section>
  )
}
