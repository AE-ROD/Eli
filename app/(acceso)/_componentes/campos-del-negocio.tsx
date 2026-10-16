"use client"

import { Hand, Scissors, Sparkles, type LucideIcon } from "lucide-react"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import type { ColorDeModulo } from "@/lib/modulos"
import { RUBROS, type RubroId } from "@/lib/rubros"
import { GrupoDeOpciones, type OpcionDeGrupo } from "./grupo-de-opciones"

/** El ícono y el pastel de cada rubro: los mismos que tienen los oficios en el menú de la landing. */
const ICONO_DE_RUBRO: Record<RubroId, { figura: LucideIcon; color: ColorDeModulo }> = {
  salon: { figura: Sparkles, color: "lila" },
  barberia: { figura: Scissors, color: "azul" },
  "spa-de-unas": { figura: Hand, color: "naranja" },
}

const OPCIONES_DE_RUBRO: readonly OpcionDeGrupo<RubroId>[] = RUBROS.map((rubro) => ({
  valor: rubro.id,
  texto: rubro.nombre,
  icono: ICONO_DE_RUBRO[rubro.id],
}))

interface PropsDeCamposDelNegocio {
  nombre: string
  alCambiarNombre: (nombre: string) => void
  rubro: RubroId | ""
  alElegirRubro: (rubro: RubroId) => void
  /** El error del tipo de negocio, cuando falta elegirlo. */
  errorDeRubro?: string
}

/**
 * El nombre y el tipo del negocio, lo mismo en las dos pantallas que lo piden:
 * el segundo paso de crear la cuenta y completar el perfil después de entrar
 * con Google.
 */
export function CamposDelNegocio({ nombre, alCambiarNombre, rubro, alElegirRubro, errorDeRubro }: PropsDeCamposDelNegocio) {
  return (
    <>
      <CampoFormulario
        etiqueta="Nombre de tu negocio"
        type="text"
        autoComplete="organization"
        placeholder="Por ejemplo, Salón María"
        value={nombre}
        onChange={(evento) => alCambiarNombre(evento.target.value)}
        required
      />
      <GrupoDeOpciones
        leyenda="Tipo de negocio"
        opciones={OPCIONES_DE_RUBRO}
        elegida={rubro}
        alElegir={alElegirRubro}
        error={errorDeRubro}
      />
    </>
  )
}
