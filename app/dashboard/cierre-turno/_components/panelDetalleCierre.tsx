"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, X, RefreshCw } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { BadgeEstadoCierre } from "./badgeEstadoCierre"
import { METODOS_PAGO, numero, type CierreTurnoAPI, type PaymentBreakdownItem, type TipsBreakdownItem } from "./tipos"

interface PanelDetalleCierreProps {
  cierre: CierreTurnoAPI
  puedeEditar: boolean
  puedeRevisar: boolean
  onCerrarPanel: () => void
  onGuardar: (id: string, datos: Record<string, unknown>) => Promise<void>
  onRecalcular: (id: string) => Promise<void>
}

function formatearMonto(valor: number) {
  return valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
}

export function PanelDetalleCierre({
  cierre,
  puedeEditar,
  puedeRevisar,
  onCerrarPanel,
  onGuardar,
  onRecalcular,
}: PanelDetalleCierreProps) {
  const soloLectura = !puedeEditar || cierre.status === "REVISADO" || (cierre.status === "CERRADO" && !puedeRevisar)

  const [cashOpening, setCashOpening] = useState(numero(cierre.cashOpening))
  const [cashClosing, setCashClosing] = useState(numero(cierre.cashClosing))
  const [cashWithdrawals, setCashWithdrawals] = useState(numero(cierre.cashWithdrawals))
  const [cashDeposits, setCashDeposits] = useState(numero(cierre.cashDeposits))
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdownItem[]>(
    cierre.paymentBreakdown ?? METODOS_PAGO.map((m) => ({ method: m.value, amount: 0, transactionCount: 0 }))
  )
  const [propinasActivas, setPropinasActivas] = useState((numero(cierre.tipsTotal) ?? 0) > 0 || (cierre.tipsBreakdown?.length ?? 0) > 0)
  const [tipsTotal, setTipsTotal] = useState(numero(cierre.tipsTotal))
  const [tipsBreakdown, setTipsBreakdown] = useState<TipsBreakdownItem[]>(cierre.tipsBreakdown ?? [])
  const [pendingItems, setPendingItems] = useState<string[]>(cierre.pendingItems ?? [])
  const [nuevoPendiente, setNuevoPendiente] = useState("")
  const [observations, setObservations] = useState(cierre.observations ?? "")
  const [reviewNotes, setReviewNotes] = useState(cierre.reviewNotes ?? "")
  const [confirmado, setConfirmado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [cerrandoTurno, setCerrandoTurno] = useState(false)
  const [recalculando, setRecalculando] = useState(false)
  const [aprobando, setAprobando] = useState(false)

  useEffect(() => {
    setCashOpening(numero(cierre.cashOpening))
    setCashClosing(numero(cierre.cashClosing))
    setCashWithdrawals(numero(cierre.cashWithdrawals))
    setCashDeposits(numero(cierre.cashDeposits))
    setPaymentBreakdown(
      cierre.paymentBreakdown ?? METODOS_PAGO.map((m) => ({ method: m.value, amount: 0, transactionCount: 0 }))
    )
    setPropinasActivas((numero(cierre.tipsTotal) ?? 0) > 0 || (cierre.tipsBreakdown?.length ?? 0) > 0)
    setTipsTotal(numero(cierre.tipsTotal))
    setTipsBreakdown(cierre.tipsBreakdown ?? [])
    setPendingItems(cierre.pendingItems ?? [])
    setObservations(cierre.observations ?? "")
    setReviewNotes(cierre.reviewNotes ?? "")
    setConfirmado(false)
  }, [cierre])

  const totalDeclarado = useMemo(
    () => paymentBreakdown.reduce((acc, p) => acc + (Number(p.amount) || 0), 0),
    [paymentBreakdown]
  )

  const diferenciaCaja = useMemo(
    () => cashOpening + cashDeposits - cashWithdrawals - cashClosing,
    [cashOpening, cashDeposits, cashWithdrawals, cashClosing]
  )

  const expectedRevenue = numero(cierre.expectedRevenue)
  const diferenciaIngreso = totalDeclarado - expectedRevenue

  const actualizarMetodoPago = (index: number, campo: "amount" | "transactionCount", valor: number) => {
    setPaymentBreakdown((prev) => prev.map((p, i) => (i === index ? { ...p, [campo]: valor } : p)))
  }

  const agregarPendiente = () => {
    if (!nuevoPendiente.trim()) return
    setPendingItems((prev) => [...prev, nuevoPendiente.trim()])
    setNuevoPendiente("")
  }

  const quitarPendiente = (index: number) => {
    setPendingItems((prev) => prev.filter((_, i) => i !== index))
  }

  const construirPayloadBase = () => ({
    declaredRevenue: totalDeclarado,
    cashOpening,
    cashClosing,
    cashWithdrawals,
    cashDeposits,
    paymentBreakdown,
    tipsTotal: propinasActivas ? tipsTotal : 0,
    tipsBreakdown: propinasActivas ? tipsBreakdown : [],
    pendingItems,
    observations,
  })

  const guardarBorrador = async () => {
    setGuardando(true)
    try {
      await onGuardar(cierre.id, construirPayloadBase())
    } finally {
      setGuardando(false)
    }
  }

  const cerrarTurno = async () => {
    setCerrandoTurno(true)
    try {
      await onGuardar(cierre.id, { ...construirPayloadBase(), status: "CERRADO" })
    } finally {
      setCerrandoTurno(false)
    }
  }

  const recalcular = async () => {
    setRecalculando(true)
    try {
      await onRecalcular(cierre.id)
    } finally {
      setRecalculando(false)
    }
  }

  const aprobarRevision = async () => {
    setAprobando(true)
    try {
      await onGuardar(cierre.id, { status: "REVISADO", reviewNotes })
    } finally {
      setAprobando(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onCerrarPanel()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-6">
        <SheetHeader className="px-0">
          <SheetTitle className="flex items-center gap-3">
            Cierre de turno
            <BadgeEstadoCierre estado={cierre.status} />
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {/* Sección 1: info básica */}
          <section className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Fecha: </span>
              {new Date(cierre.shiftDate).toLocaleDateString("es-MX")}
            </p>
            <p>
              <span className="text-muted-foreground">Período: </span>
              {cierre.shiftPeriod ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Responsable: </span>
              {cierre.closedBy?.user?.name ?? "—"}
            </p>
            {cierre.reviewedBy && (
              <p>
                <span className="text-muted-foreground">Revisado por: </span>
                {cierre.reviewedBy.user.name}
              </p>
            )}
          </section>

          {/* Sección 2: resumen de citas */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Resumen de citas (auto-calculado)</h3>
              {!soloLectura && (
                <button
                  type="button"
                  onClick={recalcular}
                  disabled={recalculando}
                  className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${recalculando ? "animate-spin" : ""}`} />
                  Recalcular
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Programadas</p>
                <p className="font-medium">{cierre.appointmentsTotal}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Completadas</p>
                <p className="font-medium">{cierre.appointmentsCompleted}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Canceladas</p>
                <p className="font-medium">{cierre.appointmentsCancelled}</p>
              </div>
              <div>
                <p className="text-muted-foreground">No-shows</p>
                <p className="font-medium">{cierre.appointmentsNoShow}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Ingreso esperado</p>
                <p className="font-semibold">{formatearMonto(expectedRevenue)}</p>
              </div>
            </div>
          </section>

          {/* Sección 3: caja y desglose de pagos */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <h3 className="font-semibold text-sm">Caja</h3>
            <div className="grid grid-cols-2 gap-3">
              <CampoMonto etiqueta="Apertura" valor={cashOpening} onChange={setCashOpening} disabled={soloLectura} />
              <CampoMonto etiqueta="Cierre" valor={cashClosing} onChange={setCashClosing} disabled={soloLectura} />
              <CampoMonto etiqueta="Retiros" valor={cashWithdrawals} onChange={setCashWithdrawals} disabled={soloLectura} />
              <CampoMonto etiqueta="Depósitos" valor={cashDeposits} onChange={setCashDeposits} disabled={soloLectura} />
            </div>
            <p className="text-sm">
              <span className="text-muted-foreground">Diferencia de caja: </span>
              <span className={diferenciaCaja < 0 ? "text-red-600 font-medium" : "font-medium"}>
                {formatearMonto(diferenciaCaja)}
              </span>
            </p>

            <h4 className="font-medium text-sm mt-4">Desglose por método de pago</h4>
            <div className="space-y-2">
              {paymentBreakdown.map((item, i) => (
                <div key={item.method} className="grid grid-cols-[1fr_1fr_80px] gap-2 items-center">
                  <span className="text-sm text-muted-foreground">
                    {METODOS_PAGO.find((m) => m.value === item.method)?.label}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    disabled={soloLectura}
                    value={item.amount}
                    onChange={(e) => actualizarMetodoPago(i, "amount", parseFloat(e.target.value) || 0)}
                    className="px-3 py-1.5 rounded-md border border-border bg-background text-sm disabled:opacity-60"
                    placeholder="Monto"
                  />
                  <input
                    type="number"
                    disabled={soloLectura}
                    value={item.transactionCount}
                    onChange={(e) => actualizarMetodoPago(i, "transactionCount", parseInt(e.target.value) || 0)}
                    className="px-3 py-1.5 rounded-md border border-border bg-background text-sm disabled:opacity-60"
                    placeholder="# trans."
                  />
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Total declarado: </span>
                <span className="font-semibold">{formatearMonto(totalDeclarado)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Diferencia vs. esperado: </span>
                <span className={diferenciaIngreso < 0 ? "text-red-600 font-medium" : "font-medium"}>
                  {formatearMonto(diferenciaIngreso)}
                </span>
              </p>
            </div>
          </section>

          {/* Sección 4: propinas */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Propinas</h3>
              <Switch checked={propinasActivas} onCheckedChange={setPropinasActivas} disabled={soloLectura} />
            </div>
            {propinasActivas && (
              <div className="space-y-3">
                <CampoMonto etiqueta="Total de propinas" valor={tipsTotal} onChange={setTipsTotal} disabled={soloLectura} />
                {tipsBreakdown.length > 0 && (
                  <div className="space-y-1">
                    {tipsBreakdown.map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t.memberId}</span>
                        <span>{formatearMonto(numero(t.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Sección 5: pendientes */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <h3 className="font-semibold text-sm">Pendientes para el siguiente turno</h3>
            <ul className="space-y-1">
              {pendingItems.map((item, i) => (
                <li key={i} className="flex items-center justify-between text-sm bg-muted rounded-md px-3 py-1.5">
                  <span>{item}</span>
                  {!soloLectura && (
                    <button type="button" onClick={() => quitarPendiente(i)}>
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!soloLectura && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevoPendiente}
                  onChange={(e) => setNuevoPendiente(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregarPendiente())}
                  placeholder="Agregar pendiente..."
                  className="flex-1 px-3 py-1.5 rounded-md border border-border bg-background text-sm"
                />
                <button
                  type="button"
                  onClick={agregarPendiente}
                  className="p-1.5 rounded-md border border-border hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
          </section>

          {/* Sección 6: observaciones */}
          <section className="space-y-2">
            <h3 className="font-semibold text-sm">Observaciones</h3>
            <Textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value.slice(0, 1000))}
              maxLength={1000}
              disabled={soloLectura}
              placeholder="Observaciones del turno..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">{observations.length}/1000</p>
          </section>

          {/* Revisión (solo si CERRADO y puede revisar) */}
          {cierre.status === "CERRADO" && puedeRevisar && (
            <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <h3 className="font-semibold text-sm">Revisión</h3>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Notas del revisor..."
                rows={3}
              />
              <BotonPrimario type="button" onClick={aprobarRevision} cargando={aprobando} anchoCompleto>
                Aprobar y marcar como Revisado
              </BotonPrimario>
            </section>
          )}

          {cierre.status === "REVISADO" && cierre.reviewNotes && (
            <section className="space-y-1 text-sm">
              <h3 className="font-semibold">Notas del revisor</h3>
              <p className="text-muted-foreground">{cierre.reviewNotes}</p>
            </section>
          )}

          {/* Footer de acciones, solo si es editable y está en BORRADOR */}
          {!soloLectura && cierre.status === "BORRADOR" && (
            <div className="space-y-3 pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={confirmado} onCheckedChange={(v) => setConfirmado(v === true)} />
                Confirmo que la información es correcta
              </label>
              <div className="flex gap-3">
                <BotonPrimario
                  type="button"
                  variante="secundario"
                  onClick={guardarBorrador}
                  cargando={guardando}
                  className="flex-1"
                >
                  Guardar Borrador
                </BotonPrimario>
                <BotonPrimario
                  type="button"
                  onClick={cerrarTurno}
                  cargando={cerrandoTurno}
                  disabled={!confirmado}
                  className="flex-1"
                >
                  Cerrar Turno
                </BotonPrimario>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CampoMonto({
  etiqueta,
  valor,
  onChange,
  disabled,
}: {
  etiqueta: string
  valor: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{etiqueta}</label>
      <input
        type="number"
        step="0.01"
        disabled={disabled}
        value={valor}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm disabled:opacity-60"
      />
    </div>
  )
}
