"use client"

import { useCallback, useEffect, useState } from "react"
import { HeartHandshake, Mail, MessageCircle } from "lucide-react"
import { Boton, clasesDeBoton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Insignia } from "@/components/comunes/insignia"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { nombreCompletoDeCliente } from "@/lib/nombre-de-cliente"
import { Aviso } from "@/components/panel/aviso"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { leerClientesQueSeVan, registrarContacto, type ClienteQueSeVa } from "../_datos"
import {
  asuntoSugerido,
  dias,
  enlaceDeCorreo,
  enlaceDeWhatsapp,
  fechaParaLeer,
  mensajeSugerido,
} from "../_escribirle"
import { frasesDeClientes } from "../_frases"

/** Las palabras de un rubro sin palabras propias: lo que dice la vista si quien la usa no pasa las suyas. */
const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

interface PropsDeVistaSeVan {
  /** Para firmar el mensaje sugerido: "Te escribimos de …". */
  nombreNegocio: string
  /** Las palabras del rubro: "cliente(s)" o, en una clínica dental, "paciente(s)". Sin ellas, las de siempre. */
  palabras?: PalabrasDelRubro
}

const ICONO = "size-4"

/**
 * "Se están yendo" (#76): los clientes que no vienen hace al menos 1,5 veces
 * lo que suelen tardar y no tienen hora. "Escribirle" abre WhatsApp o el
 * correo de quien mira con un mensaje listo para cambiar; lo manda la
 * persona, no Eli. Al tocarlo se anota (cuenta en "Mensajes de este mes") y
 * la fila sale de la lista unos días.
 *
 * Primero el teléfono: una columna de tarjetas, con los botones de un toque.
 * Sólo la ven dueña y encargado; el servidor lo vuelve a verificar.
 */
export function VistaSeVan({ nombreNegocio, palabras = PALABRAS_NEUTRAS }: PropsDeVistaSeVan) {
  const { seVan } = frasesDeClientes(palabras)
  const [clientes, setClientes] = useState<ClienteQueSeVa[]>([])
  const [total, setTotal] = useState(0)
  const [diasOculto, setDiasOculto] = useState(14)
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState("")
  const [listo, setListo] = useState("")

  const cargar = useCallback(async () => {
    setCargando(true)
    setAviso("")
    const resultado = await leerClientesQueSeVan(palabras)
    if (resultado.ok) {
      setClientes(resultado.datos.clientes)
      setTotal(resultado.datos.total)
      setDiasOculto(resultado.datos.diasOcultoTrasContacto)
    } else {
      setAviso(resultado.error)
    }
    setCargando(false)
  }, [palabras])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga la lista al montar
  useEffect(() => { cargar() }, [cargar])

  /**
   * Se llama al tocar el enlace, sin frenarlo: WhatsApp o el correo se abren
   * igual. Si el registro falla, la fila se queda y se dice por qué.
   */
  const anotar = async (cliente: ClienteQueSeVa) => {
    setAviso("")
    setListo("")
    const resultado = await registrarContacto(cliente.id)
    if (!resultado.ok) return setAviso(`${resultado.error}. ${cliente.nombre} sigue en la lista.`)
    setClientes((previos) => previos.filter((otro) => otro.id !== cliente.id))
    setTotal((previo) => Math.max(0, previo - 1))
    setListo(`Anotamos que le escribiste a ${cliente.nombre}. Vuelve a la lista el ${fechaParaLeer(resultado.datos.vuelveALaListaEl)} si no reserva.`)
  }

  return (
    <section aria-labelledby="titulo-se-van" className="space-y-4">
      <div className="space-y-1">
        <h2 id="titulo-se-van" className="font-semibold text-navy">
          Se están yendo
        </h2>
        <p className="max-w-prose text-sm text-pretty text-texto-2">
          {seVan.descripcion(dias(diasOculto))}
        </p>
      </div>

      {aviso && (
        <Aviso
          accion={
            <Boton type="button" variante="secundario" tamano="sm" onClick={cargar}>
              Reintentar
            </Boton>
          }
        >
          {aviso}
        </Aviso>
      )}
      {listo && (
        <Aviso tono="listo" rol="status">
          {listo}
        </Aviso>
      )}

      {cargando ? (
        <div aria-busy="true">
          <span className="sr-only">{seVan.cargando}</span>
          <ul aria-hidden="true" className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="space-y-3 rounded-[24px] bg-tarjeta p-4 shadow-sm squircle">
                <Esqueleto className="h-3.5 w-1/2" />
                <Esqueleto className="w-3/4" />
                <Esqueleto className="h-10 w-full" />
              </li>
            ))}
          </ul>
        </div>
      ) : clientes.length === 0 ? (
        !aviso && (
          <div className="flex flex-col items-center gap-2 rounded-panel border-2 border-dashed border-borde px-6 py-12 text-center squircle">
            <CuadroDeIcono icono={HeartHandshake} color="lila" tamano="lg" />
            <p className="mt-2 font-semibold text-navy">Nadie se está yendo por ahora</p>
            <p className="max-w-sm text-sm text-pretty text-texto-2">
              {seVan.vacio}
            </p>
          </div>
        )
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {clientes.map((cliente) => (
              <li key={cliente.id} className="min-w-0">
                <FilaSeVa cliente={cliente} nombreNegocio={nombreNegocio} segunElServicio={seVan.segunElServicio} onEscribir={() => anotar(cliente)} />
              </li>
            ))}
          </ul>
          {total > clientes.length && (
            <p className="text-sm text-texto-2">
              Se muestran {clientes.length} de {total}. Al escribirles, van apareciendo los demás.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function FilaSeVa({
  cliente,
  nombreNegocio,
  segunElServicio,
  onEscribir,
}: {
  cliente: ClienteQueSeVa
  nombreNegocio: string
  /** "(según el servicio)" / "(según la prestación)": de dónde sale cada cuánto vuelve. */
  segunElServicio: string
  onEscribir: () => void
}) {
  const nombreCompleto = nombreCompletoDeCliente({ name: cliente.nombre, lastName: cliente.apellido })
  const mensaje = mensajeSugerido({ nombre: cliente.nombre, nombreNegocio, ultimoServicio: cliente.ultimoServicio })
  const whatsapp = enlaceDeWhatsapp(cliente.telefono, mensaje)
  const correo = enlaceDeCorreo(cliente.email, asuntoSugerido(nombreNegocio), mensaje)
  const idDelNombre = `se-va-${cliente.id}`

  return (
    <Tarjeta como="article" aria-labelledby={idDelNombre} className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 id={idDelNombre} className="min-w-0 font-semibold break-words text-navy">
          {nombreCompleto}
        </h3>
        <Insignia tono="lila" className="shrink-0">
          Hace {dias(cliente.diasSinVenir)}
        </Insignia>
      </div>

      <dl className="space-y-1 text-sm text-texto-2">
        <div className="flex gap-1">
          <dt>Suele venir cada</dt>
          <dd className="text-navy">
            {dias(cliente.ciclo)}
            {cliente.origenDelCiclo === "servicio" && <span className="text-texto-2"> {segunElServicio}</span>}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt>Última visita:</dt>
          <dd className="text-navy">
            {cliente.ultimoServicio ? `${cliente.ultimoServicio}, el ` : "el "}
            {fechaParaLeer(cliente.ultimaVisita)}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onEscribir}
            className={clasesDeBoton({ variante: "primario", tamano: "sm", className: "flex-1" })}
          >
            <MessageCircle className={ICONO} aria-hidden="true" strokeWidth={1.75} />
            <span>
              Escribirle<span className="sr-only"> a {cliente.nombre}</span> por WhatsApp
            </span>
          </a>
        )}
        {correo && (
          <a
            href={correo}
            onClick={onEscribir}
            className={clasesDeBoton({ variante: "secundario", tamano: "sm", className: "flex-1" })}
          >
            <Mail className={ICONO} aria-hidden="true" strokeWidth={1.75} />
            <span>
              {whatsapp ? "Por correo" : "Escribirle por correo"}
              <span className="sr-only"> a {cliente.nombre}</span>
            </span>
          </a>
        )}
        {!whatsapp && !correo && (
          <p className="text-sm text-texto-2">No tiene teléfono ni correo para escribirle.</p>
        )}
      </div>
    </Tarjeta>
  )
}
