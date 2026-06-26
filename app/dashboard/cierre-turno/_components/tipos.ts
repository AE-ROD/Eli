export type ShiftCloseStatus = "BORRADOR" | "CERRADO" | "REVISADO"

export type PaymentMethod =
  | "EFECTIVO"
  | "TARJETA_DEBITO"
  | "TARJETA_CREDITO"
  | "TRANSFERENCIA"
  | "OTRO"

export interface PaymentBreakdownItem {
  method: PaymentMethod
  amount: number
  transactionCount: number
}

export interface TipsBreakdownItem {
  memberId: string
  amount: number
}

export interface CierreTurnoAPI {
  id: string
  businessId: string
  closedById: string
  closedBy: { id: string; user: { name: string } }
  reviewedById: string | null
  reviewedBy: { id: string; user: { name: string } } | null
  shiftDate: string
  shiftPeriod: string | null
  shiftStartTime: string | null
  shiftEndTime: string | null
  status: ShiftCloseStatus
  appointmentsTotal: number
  appointmentsCompleted: number
  appointmentsCancelled: number
  appointmentsNoShow: number
  appointmentsPending: number
  expectedRevenue: string | number | null
  declaredRevenue: string | number | null
  discrepancy: string | number | null
  cashOpening: string | number | null
  cashClosing: string | number | null
  cashWithdrawals: string | number | null
  cashDeposits: string | number | null
  paymentBreakdown: PaymentBreakdownItem[] | null
  tipsTotal: string | number | null
  tipsBreakdown: TipsBreakdownItem[] | null
  pendingItems: string[]
  observations: string | null
  reviewNotes: string | null
  closedAt: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export const PERIODOS = [
  { value: "Mañana", label: "Mañana" },
  { value: "Tarde", label: "Tarde" },
  { value: "Noche", label: "Noche" },
  { value: "Turno completo", label: "Turno completo" },
]

export const METODOS_PAGO: { value: PaymentMethod; label: string }[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA_DEBITO", label: "Tarjeta de débito" },
  { value: "TARJETA_CREDITO", label: "Tarjeta de crédito" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "OTRO", label: "Otro" },
]

export function numero(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined) return 0
  return typeof valor === "number" ? valor : parseFloat(valor)
}
