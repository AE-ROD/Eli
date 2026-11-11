import type { ReactNode } from "react";
import { FlaskConical, Stethoscope } from "lucide-react";
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta";
import type {
  RepartoRespuesta,
  TonoRespuesta,
} from "@/lib/edicion-de-protesis";
import {
  llevaBase,
  nombreDeZona,
  textoDeUnidades,
  type TipoDeProtesis,
  type Unidad,
} from "@/lib/protesis";
import { cn } from "@/lib/utils";
import { fechaCorta, pesos } from "../_formato";
import { admitePilares } from "../_protesis";
import { RepartoDeProtesis } from "./reparto-de-protesis";
import { TonoParaLeer } from "./tono-de-protesis";

interface PropsDeResumenDeProtesis {
  /** Tipo y arcada (`tituloDeProtesis`). */
  titulo: string;
  idDelTitulo: string;
  subtitulo?: ReactNode;
  /** A la derecha del título: el estado, "En el plan". */
  accion?: ReactNode;
  /** Debajo del título: "Anulada el …". */
  aviso?: ReactNode;
  tipo: TipoDeProtesis;
  /** El nombre de la tratante ("(tú)" lo agrega quien llama). */
  tratante: string;
  laboratorio: { nombre: string; contacto: string | null } | null;
  /** Si no hay laboratorio: lo que se puede hacer (elegirlo). */
  accionSinLaboratorio?: ReactNode;
  piezas: readonly number[];
  pilares: readonly number[];
  zonas: readonly string[];
  material: {
    nombre: string;
    unidad: Unidad;
    precioUnitarioCents: number;
  } | null;
  unidades: number | null;
  tono: Pick<TonoRespuesta, "etiqueta" | "grupo" | "color"> | null;
  /** "AAAA-MM-DD". */
  entregaEstimada: string | null;
  /** `null` mientras no hay valor (falta el material o el diseño). */
  dinero: {
    valorCents: number;
    pagadoCents: number;
    saldoCents: number;
  } | null;
  /** Lo que la API (o la vista previa) le deja ver a quien mira: la dueña, tres partes; la odontóloga, la suya. */
  reparto: RepartoRespuesta | null;
  /** La tratante es la dueña: su parte va a la clínica (lo dice el reparto). */
  tratanteEsLaDuena: boolean;
  vistaPrevia?: boolean;
}

/**
 * El resumen de una prótesis: en "Nueva prótesis" antes de crearla y en la
 * tarjeta de cada una del historial. En este orden: tipo y arcada de título;
 * quién la hace (la odontóloga a cargo y el laboratorio, los dos datos que
 * más se buscan, destacados); el diseño (piezas y pilares como chips con su
 * número FDI, zonas de la base), el material con sus unidades, el tono y la
 * entrega; el valor con lo pagado y el saldo, y el reparto que le toca ver a
 * quien mira.
 *
 * Sólo muestra: no calcula partes ni valores (vienen de la API o de la vista
 * previa de `_protesis.ts`).
 */
export function ResumenDeProtesis({
  titulo,
  idDelTitulo,
  subtitulo,
  accion,
  aviso,
  tipo,
  tratante,
  laboratorio,
  accionSinLaboratorio,
  piezas,
  pilares,
  zonas,
  material,
  unidades,
  tono,
  entregaEstimada,
  dinero,
  reparto,
  tratanteEsLaDuena,
  vistaPrevia = false,
}: PropsDeResumenDeProtesis) {
  const datos: { clave: string; valor: ReactNode }[] = [
    {
      clave: "Piezas protésicas",
      valor:
        tipo === "total" ? (
          `Todas las de la arcada, sin cordales (${piezas.length})`
        ) : piezas.length > 0 ? (
          <ChipsDePiezas piezas={piezas} marca="protesica" />
        ) : (
          <span className="text-texto-2">Sin marcar todavía</span>
        ),
    },
    ...(admitePilares(tipo)
      ? [
          {
            clave: "Pilares o ganchos",
            valor:
              pilares.length > 0 ? (
                <ChipsDePiezas piezas={pilares} marca="pilar" />
              ) : (
                <span className="text-texto-2">Ninguno</span>
              ),
          },
        ]
      : []),
    ...(llevaBase(tipo)
      ? [
          {
            clave: "Zonas de la base",
            valor:
              zonas.length > 0 ? (
                zonas.map(nombreDeZona).join(", ")
              ) : (
                <span className="text-texto-2">Ninguna</span>
              ),
          },
        ]
      : []),
    {
      clave: "Material",
      valor: material?.nombre ?? (
        <span className="text-texto-2">Sin elegir</span>
      ),
    },
    ...(material && unidades !== null
      ? [
          {
            clave: "Unidades",
            valor: (
              <span className="tabular-nums">{`${textoDeUnidades(material.unidad, unidades)} × ${pesos(material.precioUnitarioCents)}`}</span>
            ),
          },
        ]
      : []),
    { clave: "Tono", valor: <TonoParaLeer tono={tono} /> },
    {
      clave: "Entrega estimada",
      valor: entregaEstimada ? (
        fechaDelDia(entregaEstimada)
      ) : (
        <span className="text-texto-2">Sin fecha</span>
      ),
    },
  ];

  return (
    <div>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo={titulo}
        subtitulo={subtitulo}
        accion={accion}
      />
      {aviso}

      {/* Dos bloques: quién y qué (izquierda), el dinero (derecha); en una columna angosta, uno debajo del otro. */}
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-5">
        <div className="min-w-0 flex-[3_1_320px]">
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-2.5">
            <div className="min-w-0 rounded-[20px] bg-superficie px-4 py-3 squircle">
              <dt className="flex items-center gap-1.5 text-[13px] text-texto-2">
                <Stethoscope
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.75}
                />
                Odontólogo/a a cargo
              </dt>
              <dd className="mt-1 text-base font-semibold break-words">
                {tratante}
              </dd>
            </div>
            <div className="min-w-0 rounded-[20px] bg-superficie px-4 py-3 squircle">
              <dt className="flex items-center gap-1.5 text-[13px] text-texto-2">
                <FlaskConical
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.75}
                />
                Técnico / laboratorio
              </dt>
              <dd className="mt-1 min-w-0">
                {laboratorio ? (
                  <>
                    <span className="block text-base font-semibold break-words">
                      {laboratorio.nombre}
                    </span>
                    {laboratorio.contacto && (
                      <span className="mt-0.5 block text-sm break-words text-texto-2">
                        {laboratorio.contacto}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="block text-base font-semibold">
                      Sin laboratorio asignado
                    </span>
                    {accionSinLaboratorio && (
                      <span className="mt-2 block">{accionSinLaboratorio}</span>
                    )}
                  </>
                )}
              </dd>
            </div>
          </dl>

          <dl className="mt-4">
            {datos.map((fila) => (
              <div
                key={fila.clave}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-borde py-2.5 text-sm"
              >
                <dt className="w-36 shrink-0 text-texto-2">{fila.clave}</dt>
                <dd className="min-w-0 flex-[1_1_11rem] font-medium break-words">
                  {fila.valor}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="min-w-0 flex-[2_1_280px]">
          {/* El valor, grande y arriba; pagado y saldo debajo, lado a lado. */}
          <dl className="flex flex-wrap gap-2">
            {[
              {
                clave: "Valor al paciente",
                cents: dinero?.valorCents ?? null,
                fuerte: true,
              },
              {
                clave: "Pagado",
                cents: dinero?.pagadoCents ?? null,
                fuerte: false,
              },
              {
                clave: "Saldo",
                cents: dinero?.saldoCents ?? null,
                fuerte: false,
              },
            ].map((fila) => (
              <div
                key={fila.clave}
                className={cn(
                  "min-w-0 rounded-[16px] bg-superficie px-3.5 py-2.5 squircle",
                  fila.fuerte ? "basis-full" : "min-w-28 flex-1",
                )}
              >
                <dt className="text-[13px] text-texto-2">{fila.clave}</dt>
                <dd
                  className={cn(
                    "mt-0.5 whitespace-nowrap tabular-nums",
                    fila.fuerte
                      ? "text-[26px] leading-tight font-medium tracking-[-0.5px]"
                      : "font-semibold",
                  )}
                >
                  {fila.cents === null ? "—" : pesos(fila.cents)}
                </dd>
              </div>
            ))}
          </dl>
          {vistaPrevia && (
            <p className="mt-2 text-[13px] leading-snug text-texto-2">
              Vista previa: el servidor calcula el valor con el precio del
              catálogo al crear la prótesis. Se paga por partes en la Sala de
              espera.
            </p>
          )}

          {reparto && dinero && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">Reparto</h4>
              <RepartoDeProtesis
                reparto={reparto}
                tratante={tratante}
                laboratorio={laboratorio?.nombre ?? null}
                tratanteEsLaDuena={tratanteEsLaDuena}
                vistaPrevia={vistaPrevia}
                className="mt-2"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Las piezas como chips con su número FDI: lila con número navy la protésica; el naranja suave del pilar. */
function ChipsDePiezas({
  piezas,
  marca,
}: {
  piezas: readonly number[];
  marca: "protesica" | "pilar";
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {piezas.map((pieza) => (
        <li
          key={pieza}
          className={cn(
            "inline-flex h-7 min-w-9 items-center justify-center rounded-full px-2 text-[13px] font-semibold text-navy tabular-nums",
            marca === "protesica"
              ? "bg-lila-suave ring-1 ring-lila ring-inset"
              : "bg-naranja-suave ring-1 ring-naranja ring-inset",
          )}
        >
          {pieza}
        </li>
      ))}
    </ul>
  );
}

/** "12 dic 2026", desde un día "AAAA-MM-DD" (sin hora: no depende de la zona). */
export function fechaDelDia(dia: string): string {
  return fechaCorta(`${dia}T12:00:00Z`, "UTC");
}
