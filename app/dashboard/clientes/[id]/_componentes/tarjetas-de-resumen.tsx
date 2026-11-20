import type { ReactNode } from "react"
import { TriangleAlert } from "lucide-react"
import type { PlanRespuesta } from "@/lib/edicion-del-plan"
import { nombreDeEstadoDeEtapa } from "@/lib/plan-de-tratamiento"
import { mostrarTelefono } from "@/lib/telefono"
import { cn } from "@/lib/utils"
import { cuandoEsLaCita, etapaEnCurso, pesos } from "../_formato"

/** Cada tarjeta del resumen: blanca, de radio 24, como en `Ficha.dc.html`. */
const TARJETA = "rounded-[24px] bg-tarjeta px-[18px] py-4 shadow-sm squircle max-lg:rounded-[20px] max-lg:px-3.5 max-lg:py-3"

export interface ProximaCita {
  /** ISO. */
  inicio: string
  motivo: string
  sillon: string | null
}

interface PropsDeTarjetasDeResumen {
  alergias: string | null
  proximaCita: ProximaCita | null
  /** `null` si quien mira no ve el plan (no pasa en una clínica dental: todos lo ven). */
  plan: PlanRespuesta | null
  telefono: string | null
  email: string | null
  zona: string
  hoy: string
}

/**
 * Lo primero que se mira del paciente, en cuatro tarjetas: la alerta de
 * alergias, la próxima cita, cómo va el plan y cómo contactarlo.
 *
 * La alerta va siempre, y la ven dueño, encargado y odontólogos: con
 * alergias anotadas, en el naranja de atención y con el ícono (no sólo el
 * color); sin nada anotado lo dice así, "sin alergias anotadas", que no es lo
 * mismo que "no tiene alergias".
 */
export function TarjetasDeResumen({ alergias, proximaCita, plan, telefono, email, zona, hoy }: PropsDeTarjetasDeResumen) {
  const vigente = plan?.plan ?? null
  const enCurso = vigente ? etapaEnCurso(vigente) : null
  const telefonoParaMostrar = mostrarTelefono(telefono)

  return (
    <ul aria-label="Resumen del paciente" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 max-lg:grid-cols-2 max-lg:gap-2">
      {alergias ? (
        <li className="flex items-start gap-3 rounded-[24px] bg-naranja-suave px-[18px] py-4 squircle max-lg:col-span-2 max-lg:px-3.5 max-lg:py-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" strokeWidth={1.75} />
          <span className="min-w-0">
            <span className="block font-semibold">Alergias</span>
            <span className="mt-0.5 block text-sm break-words whitespace-pre-line">{alergias}</span>
          </span>
        </li>
      ) : (
        <Tarjeta titulo="Alergias" valor="Sin alergias anotadas" className="max-lg:col-span-2" />
      )}

      <Tarjeta
        titulo="Próxima cita"
        valor={
          proximaCita
            ? `${cuandoEsLaCita(proximaCita.inicio, zona, hoy)}${proximaCita.sillon ? ` · ${proximaCita.sillon}` : ""}`
            : "Sin citas por delante"
        }
        detalle={proximaCita?.motivo}
      />

      <Tarjeta
        titulo="Plan de tratamiento"
        valor={
          !vigente
            ? "Sin plan de tratamiento"
            : vigente.etapas.length === 0
              ? "Plan sin etapas todavía"
              : enCurso
                ? `Etapa ${enCurso.numero} de ${enCurso.de} · ${nombreDeEstadoDeEtapa(enCurso.etapa.estado).toLocaleLowerCase("es-CL")}`
                : "Todo lo del plan está realizado"
        }
        detalle={
          vigente && vigente.etapas.length > 0
            ? `Total ${pesos(vigente.totales.totalCents)} · aprobado ${pesos(vigente.totales.aprobadoCents)}`
            : undefined
        }
        numeros
      />

      <Tarjeta
        titulo="Contacto"
        className="max-lg:col-span-2"
        valor={telefonoParaMostrar || email || "Sin datos de contacto"}
        detalle={telefonoParaMostrar && email ? email : undefined}
        numeros={!!telefonoParaMostrar}
      />
    </ul>
  )
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  numeros = false,
  className,
}: {
  titulo: string
  valor: ReactNode
  detalle?: ReactNode
  numeros?: boolean
  className?: string
}) {
  return (
    // En el celular, de dos en fondo: la letra baja un punto para que entren.
    <li className={cn(TARJETA, "max-lg:text-sm", className)}>
      <span className="block text-[13px] text-texto-2">{titulo}</span>
      <span className={cn("mt-1 block font-medium break-words", numeros && "tabular-nums")}>{valor}</span>
      {detalle && <span className={cn("mt-0.5 block text-sm break-words text-texto-2", numeros && "tabular-nums")}>{detalle}</span>}
    </li>
  )
}
