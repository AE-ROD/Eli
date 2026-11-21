"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { CasillaDeSeleccion } from "@/components/panel/casilla-de-seleccion"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { IconoWhatsapp } from "@/components/panel/icono-whatsapp"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { mostrarTelefono } from "@/lib/telefono"
import { cn } from "@/lib/utils"
import {
  conectarElWhatsapp,
  desconectarElWhatsapp,
  leerElWhatsapp,
  type EstadoDelWhatsapp,
} from "../_datos"
import type { CanalDeLaSecretaria } from "../_lecturas"

/** Cada cuánto se pregunta si ya se escaneó el código. */
const CADA_CUANTO_SE_MIRA_MS = 2500

/**
 * El WhatsApp del negocio, vinculado como un dispositivo más (igual que
 * WhatsApp Web): la dueña acepta las condiciones, escanea el código con su
 * celular y Eli empieza a responder. Mientras espera el escaneo, la tarjeta
 * pregunta al servidor cada 2,5 s. El encargado sólo ve si está conectado.
 */
export function SeccionWhatsapp({ inicial, editable }: { inicial: CanalDeLaSecretaria; editable: boolean }) {
  const router = useRouter()
  const idDelTitulo = useId()
  const [canal, setCanal] = useState<EstadoDelWhatsapp>({ ...inicial, qr: null })
  const [acepto, setAcepto] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const enviado = useRef(false)
  const [error, setError] = useState("")
  const [confirmando, setConfirmando] = useState(false)
  const [errorAlDesconectar, setErrorAlDesconectar] = useState("")

  const esperando = canal.estado === "esperando_qr"

  // Mientras se espera el escaneo, se pregunta hasta que se conecte o se corte.
  useEffect(() => {
    if (!editable || !esperando) return
    let vigente = true
    let temporizador: ReturnType<typeof setTimeout>

    const mirar = async () => {
      const resultado = await leerElWhatsapp()
      if (!vigente) return
      if (resultado.ok) {
        setError("")
        setCanal(resultado.datos)
        if (resultado.datos.estado !== "esperando_qr") {
          router.refresh()
          return
        }
      } else {
        setError(resultado.error)
      }
      temporizador = setTimeout(mirar, CADA_CUANTO_SE_MIRA_MS)
    }

    // El código no viene con la página: se pide apenas se entra.
    temporizador = setTimeout(mirar, 0)
    return () => {
      vigente = false
      clearTimeout(temporizador)
    }
  }, [editable, esperando, router])

  const conectar = async () => {
    if (enviado.current || !acepto) return
    enviado.current = true
    setError("")
    setTrabajando(true)
    const resultado = await conectarElWhatsapp()
    enviado.current = false
    setTrabajando(false)
    if (!resultado.ok) return setError(resultado.error)
    setCanal(resultado.datos)
  }

  const cancelar = async () => {
    if (enviado.current) return
    enviado.current = true
    setError("")
    setTrabajando(true)
    const resultado = await desconectarElWhatsapp()
    enviado.current = false
    setTrabajando(false)
    if (!resultado.ok) return setError(resultado.error)
    setCanal(resultado.datos)
    setAcepto(false)
    router.refresh()
  }

  const desconectar = async () => {
    if (enviado.current) return
    enviado.current = true
    setErrorAlDesconectar("")
    setTrabajando(true)
    const resultado = await desconectarElWhatsapp()
    enviado.current = false
    setTrabajando(false)
    if (!resultado.ok) return setErrorAlDesconectar(resultado.error)
    setConfirmando(false)
    setCanal(resultado.datos)
    setAcepto(false)
    router.refresh()
  }

  const numero = canal.numero ? mostrarTelefono(canal.numero) : "tu WhatsApp"

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Tu WhatsApp"
        subtitulo="El número donde Eli atiende a tus clientas."
        icono={{ figura: IconoWhatsapp }}
      />

      <div aria-live="polite" className="mt-5 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Insignia tono={canal.estado === "conectado" ? "lima" : canal.estado === "esperando_qr" ? "naranja" : "gris"}>
            {canal.estado === "conectado" ? "Conectado" : canal.estado === "esperando_qr" ? "Conectando" : "Sin conectar"}
          </Insignia>
          <p className="text-sm text-texto-2">
            {canal.estado === "conectado"
              ? `Eli responde los mensajes que llegan a ${numero}.`
              : canal.estado === "esperando_qr"
                ? editable
                  ? "Escanea el código con tu celular para terminar."
                  : "La dueña del negocio está conectando el WhatsApp."
                : editable
                  ? "Conecta el WhatsApp de tu negocio y Eli va a responder los mensajes de tus clientas."
                  : "La dueña del negocio todavía no conecta el WhatsApp."}
          </p>
        </div>

        {editable && canal.estado === "desconectado" && canal.motivoDesconexion && (
          <Aviso tono="atencion" titulo="Tu WhatsApp se desconectó">
            {canal.motivoDesconexion}
          </Aviso>
        )}

        {editable && canal.estado === "esperando_qr" && (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div aria-busy={!canal.qr} className="grid size-[200px] shrink-0 place-items-center rounded-campo bg-white p-2 squircle">
              {canal.qr ? (
                // Es un data URL que arma el servidor: `next/image` no aporta nada aquí.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={canal.qr} alt="Código QR para vincular WhatsApp" width={184} height={184} className="size-full" />
              ) : (
                <Esqueleto className="size-full rounded-campo" />
              )}
            </div>
            <div className="space-y-4">
              <ol className="list-decimal space-y-2 pl-5 text-sm text-navy">
                <li>Abre WhatsApp en tu celular.</li>
                <li>Toca Configuración (o los tres puntos) → Dispositivos vinculados → Vincular un dispositivo.</li>
                <li>Apunta la cámara a este código.</li>
              </ol>
              <BotonPrimario type="button" variante="secundario" tamaño="sm" cargando={trabajando} onClick={cancelar}>
                Cancelar
              </BotonPrimario>
            </div>
          </div>
        )}

        {editable && canal.estado === "desconectado" && (
          <div className="space-y-4">
            <div className="rounded-campo bg-superficie px-4 py-3 text-sm text-navy squircle">
              <p>
                Es una conexión no oficial de WhatsApp: WhatsApp podría restringir tu número si detecta uso
                automatizado. Eli sólo responde, nunca escribe primero.
              </p>
              <CasillaDeSeleccion etiqueta="Entiendo y acepto" marcada={acepto} alCambiar={setAcepto} className="mt-2">
                <span className="font-medium">Entiendo y acepto</span>
              </CasillaDeSeleccion>
            </div>
            <BotonPrimario
              type="button"
              tamaño="sm"
              icono={<IconoWhatsapp className="h-4 w-4" />}
              cargando={trabajando}
              disabled={!acepto}
              onClick={conectar}
            >
              Conectar WhatsApp
            </BotonPrimario>
          </div>
        )}

        {editable && canal.estado === "conectado" && (
          <BotonPrimario
            type="button"
            variante="secundario"
            tamaño="sm"
            onClick={() => {
              setErrorAlDesconectar("")
              setConfirmando(true)
            }}
          >
            Desconectar
          </BotonPrimario>
        )}

        {error && <Aviso>{error}</Aviso>}
      </div>

      {confirmando && (
        <ModalConfirmar
          titulo="¿Desconectar tu WhatsApp?"
          descripcion="Eli deja de responder los mensajes que llegan a tu WhatsApp. Para volver a conectarlo tienes que escanear el código de nuevo."
          textoConfirmar="Desconectar"
          textoCancelar="Volver"
          peligro
          trabajando={trabajando}
          aviso={errorAlDesconectar}
          onConfirmar={desconectar}
          onCerrar={() => setConfirmando(false)}
        />
      )}
    </section>
  )
}
