export interface RevenueResponse {
  summary: {
    totalRevenue: number
    avgPerAppointment: number
    totalAppointments: number
    comparisonPct: number | null
  }
  timeSeries: { date: string; revenue: number; appointments: number }[]
  byWorker: { memberId: string | null; name: string; revenue: number; appointments: number }[]
  byService: { serviceId: string | null; name: string; revenue: number; appointments: number }[]
  byPaymentMethod: { method: string; amount: number }[]
}

export interface AppointmentsResponse {
  summary: {
    total: number
    completed: number
    cancelled: number
    noShow: number
    pending: number
    completionRate: number
    cancellationRate: number
    noShowRate: number
  }
  timeSeries: { date: string; count: number }[]
  byStatus: { status: string; count: number }[]
  byService: { serviceId: string; name: string; count: number }[]
  byWorker: { memberId: string; name: string; count: number }[]
  byDayOfWeek: { dayOfWeek: number; label: string; count: number }[]
  byHour: { hour: number; count: number }[]
}

export interface ServicesResponse {
  ranking: {
    serviceId: string
    name: string
    totalAppointments: number
    revenue: number
    avgDurationMin: number
    cancellationRate: number
    pctOfTotal: number
  }[]
  distribution: { name: string; value: number }[]
}

export interface StaffResponse {
  workers: {
    memberId: string
    name: string
    role: string
    isOwner: boolean
    totalAppointments: number
    completedAppointments: number
    cancelledAppointments: number
    revenue: number
    avgTicket: number
    occupancyRate: number
  }[]
  ranking: { byAppointments: string[]; byRevenue: string[]; byOccupancy: string[] }
}

export interface PatientsResponse {
  summary: {
    totalActive: number
    newInPeriod: number
    recurrent: number
    retentionRate: number
    avgVisits: number
  }
  timeSeries: { date: string; newPatients: number }[]
  topByVisits: { patientId: string; name: string; visits: number; revenue: number }[]
  topByRevenue: { patientId: string; name: string; visits: number; revenue: number }[]
  inactive: { patientId: string; name: string; email: string | null; phone: string | null; lastVisit: string | null }[]
}

export interface OccupancyResponse {
  globalRate: number
  heatmap: { dayOfWeek: number; hour: number; available: number; booked: number; rate: number }[]
  peakHours: { dayOfWeek: number; hour: number; available: number; booked: number; rate: number }[]
  quietHours: { dayOfWeek: number; hour: number; available: number; booked: number; rate: number }[]
  byDayOfWeek: { dayOfWeek: number; label: string; available: number; booked: number; rate: number }[]
  slotsWasted: number
}

export const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--primary)/0.8)",
  "hsl(var(--primary)/0.65)",
  "hsl(var(--primary)/0.5)",
  "hsl(var(--primary)/0.35)",
  "hsl(var(--primary)/0.25)",
]

export function formatoMoneda(valor: number): string {
  return `$${valor.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`
}

export function formatoFechaCorta(fecha: string): string {
  // fecha puede ser YYYY-MM-DD o YYYY-MM
  const partes = fecha.split("-")
  if (partes.length === 2) {
    const [y, m] = partes
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("es-MX", { month: "short", year: "2-digit" })
  }
  const d = new Date(fecha + "T00:00:00")
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}
