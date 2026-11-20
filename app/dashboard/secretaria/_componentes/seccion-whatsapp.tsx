"use client"

import { useId, useRef, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { Link2, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Interruptor } from "@/components/comunes/interruptor"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { guardarCanal } from "../_datos"
import type { CanalDeLaSecretaria } from "../_lecturas"

const RUTA_DEL_WEBHOOK = "/api/webhooks/whatsapp"
/** Lo mismo que pide el servidor: el id numérico que muestra Meta. */
const ID_DE_META = /^\d{5,32}$/

const sinSuscripcion = () => () => {}

/** El origen de la página (`https://eliagenda.com`): en el servidor no se sabe, y va vacío. */
function useOrigen(): string {
  return useSyncExternalStore(
    sinSuscripcion,
    () => window.location.origin,
    () => ""
  )
}

/**
 * Conectar el número de WhatsApp Business del negocio (Meta Cloud API). Sólo
 * la dueña. El token es una credencial: se escribe, se guarda cifrado y no se
 * vuelve a mostrar nunca. Vacío, se conserva el que ya estaba.
 */
export function SeccionWhatsapp({ inicial }: { inicial: CanalDeLaSecretaria | null }) {
  const router = useRouter()
  const idDelTitulo = useId()
  const idDelNumero = useId()
  const idDeLaCuenta = useId()
  const idDelToken = useId()
  const origen = useOrigen()
  const [phoneNumberId, setPhoneNumberId] = useState(inicial?.phoneNumberId ?? "")
  const [wabaId, setWabaId] = useState(inicial?.wabaId ?? "")
  const [token, setToken] = useState("")
  const [activo, setActivo] = useState(inicial?.activo ?? true)
  const [guardando, setGuardando] = useState(false)
  const enviado = useRef(false)
  const [error, setError] = useState("")
  const [listo, setListo] = useState(false)
  const [intentado, setIntentado] = useState(false)

  const conectado = inicial !== null
  const numeroValido = ID_DE_META.test(phoneNumberId.trim())
  const cuentaValida = ID_DE_META.test(wabaId.trim())
  const tokenValido = conectado || token.trim() !== ""

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setIntentado(true)
    if (enviado.current || !numeroValido || !cuentaValida || !tokenValido) return
    enviado.current = true
    setError("")
    setListo(false)
    setGuardando(true)
    const resultado = await guardarCanal({
      phoneNumberId: phoneNumberId.trim(),
      wabaId: wabaId.trim(),
      ...(token.trim() ? { accessToken: token.trim() } : {}),
      activo,
    })
    enviado.current = false
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    // El token no se queda en la pantalla: ya está guardado en el servidor.
    setToken("")
    setListo(true)
    router.refresh()
  }

  const cambio = () => setListo(false)

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="WhatsApp"
        subtitulo={
          conectado
            ? inicial.activo
              ? "Tu número está conectado."
              : "Tu número está conectado, pero en pausa: Eli no lo atiende."
            : "Conecta el número de WhatsApp Business de tu negocio para que Eli lo atienda."
        }
        icono={{ figura: Link2 }}
      />

      <div className="mt-5 rounded-[20px] bg-superficie p-4 text-sm squircle">
        <p className="font-medium text-navy">Dirección para Meta (webhook)</p>
        <p className="mt-1 text-texto-2">
          En la configuración de WhatsApp de tu app de Meta, pega esta dirección como URL de devolución de llamada:
        </p>
        <code className="mt-2 block rounded-[12px] bg-tarjeta px-3 py-2 font-mono text-[13px] break-all text-navy select-all">
          {origen}
          {RUTA_DEL_WEBHOOK}
        </code>
      </div>

      <form onSubmit={guardar} className="mt-5 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={idDelNumero} className={ETIQUETA}>
              Identificador del número (phone_number_id)
            </label>
            <input
              id={idDelNumero}
              inputMode="numeric"
              autoComplete="off"
              value={phoneNumberId}
              onChange={(evento) => {
                setPhoneNumberId(evento.target.value)
                cambio()
              }}
              aria-invalid={intentado && !numeroValido}
              className={cn(CAMPO, intentado && !numeroValido && CAMPO_CON_ERROR)}
            />
            {intentado && !numeroValido && <p className={ERROR_DE_CAMPO}>Es el número largo que muestra Meta.</p>}
          </div>
          <div>
            <label htmlFor={idDeLaCuenta} className={ETIQUETA}>
              Identificador de la cuenta (waba_id)
            </label>
            <input
              id={idDeLaCuenta}
              inputMode="numeric"
              autoComplete="off"
              value={wabaId}
              onChange={(evento) => {
                setWabaId(evento.target.value)
                cambio()
              }}
              aria-invalid={intentado && !cuentaValida}
              className={cn(CAMPO, intentado && !cuentaValida && CAMPO_CON_ERROR)}
            />
            {intentado && !cuentaValida && <p className={ERROR_DE_CAMPO}>Es el número largo que muestra Meta.</p>}
          </div>
        </div>

        <div>
          <label htmlFor={idDelToken} className={ETIQUETA}>
            Token de acceso
          </label>
          <input
            id={idDelToken}
            type="password"
            autoComplete="new-password"
            value={token}
            placeholder={conectado ? "Guardado. Déjalo vacío para no cambiarlo" : ""}
            onChange={(evento) => {
              setToken(evento.target.value)
              cambio()
            }}
            aria-invalid={intentado && !tokenValido}
            className={cn(CAMPO, intentado && !tokenValido && CAMPO_CON_ERROR)}
          />
          {intentado && !tokenValido ? (
            <p className={ERROR_DE_CAMPO}>Falta el token de acceso.</p>
          ) : (
            <p className="mt-1 text-xs text-texto-2">Se guarda protegido y no se vuelve a mostrar.</p>
          )}
        </div>

        <Interruptor
          etiqueta="Número activo"
          descripcion="En pausa, Eli no responde los mensajes que lleguen a este número."
          activo={activo}
          alCambiar={(valor) => {
            setActivo(valor)
            cambio()
          }}
        />

        <BotonPrimario type="submit" tamaño="sm" icono={<Save className="h-4 w-4" />} cargando={guardando}>
          {listo ? "Guardado" : conectado ? "Guardar" : "Conectar"}
        </BotonPrimario>
        <p role="status" className="sr-only">
          {listo ? "Número de WhatsApp guardado" : ""}
        </p>
        {error && <Aviso>{error}</Aviso>}
      </form>
    </section>
  )
}
