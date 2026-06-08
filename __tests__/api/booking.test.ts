import { vi, describe, it, expect, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    service: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/lib/email", () => ({
  enviarConfirmacionCliente: vi.fn().mockResolvedValue(undefined),
  enviarAvisoProfesional: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from "@/app/api/reservar/[slug]/confirmar/route"
import { prisma } from "@/lib/prisma"
import { enviarConfirmacionCliente, enviarAvisoProfesional } from "@/lib/email"

// ─── helpers ────────────────────────────────────────────────────────────────

const MOCK_NEGOCIO = {
  id: "biz-1",
  name: "Clínica Test",
  user: { email: "doctor@test.com" },
}

const MOCK_SERVICIO = {
  id: "svc-1",
  name: "Consulta",
  duration: 60,
  price: 500,
  active: true,
}

const BASE_PAYLOAD = {
  servicioId: "svc-1",
  fecha: "2026-06-10",
  hora: "10:00",
  nombre: "Juan",
  apellido: "Pérez",
  email: "juan@test.com",
}

function makeRequest(slug: string, body: object) {
  return new NextRequest(`http://localhost/api/reservar/${slug}/confirmar`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

function makeMockTx(conflictResult: object | null) {
  return {
    appointment: {
      findFirst: vi.fn().mockResolvedValue(conflictResult),
      create: vi.fn().mockResolvedValue({ id: "cita-test-1" }),
    },
    patient: {
      upsert: vi.fn().mockResolvedValue({ id: "patient-1" }),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "patient-1" }),
    },
  }
}

function setupNegocioAndServicio() {
  vi.mocked(prisma.business.findUnique).mockResolvedValue(MOCK_NEGOCIO as never)
  vi.mocked(prisma.service.findFirst).mockResolvedValue(MOCK_SERVICIO as never)
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("POST /api/reservar/[slug]/confirmar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(enviarConfirmacionCliente).mockResolvedValue(undefined as never)
    vi.mocked(enviarAvisoProfesional).mockResolvedValue(undefined as never)
  })

  it("returns 409 SLOT_TAKEN when a concurrent booking occupies the same slot", async () => {
    setupNegocioAndServicio()

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: ReturnType<typeof makeMockTx>) => Promise<unknown>) => {
      const tx = makeMockTx({ id: "existing-appt" }) // conflict exists
      return callback(tx)
    })

    const req = makeRequest("test-clinic", BASE_PAYLOAD)
    const res = await POST(req, { params: Promise.resolve({ slug: "test-clinic" }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe("SLOT_TAKEN")
  })

  it("worker isolation: scopes conflict check to memberId so different workers can share a time slot", async () => {
    setupNegocioAndServicio()

    let capturedTx: ReturnType<typeof makeMockTx> | undefined

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: ReturnType<typeof makeMockTx>) => Promise<unknown>) => {
      capturedTx = makeMockTx(null) // no conflict for this worker
      return callback(capturedTx)
    })

    const req = makeRequest("test-clinic", { ...BASE_PAYLOAD, memberId: "worker-a" })
    const res = await POST(req, { params: Promise.resolve({ slug: "test-clinic" }) })

    // Booking succeeds
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.citaId).toBe("cita-test-1")

    // Conflict check was scoped to the specific worker
    expect(capturedTx?.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ memberId: "worker-a" }),
      })
    )
  })

  it("email resilience: returns 201 even when both emails throw after appointment is created", async () => {
    setupNegocioAndServicio()

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: ReturnType<typeof makeMockTx>) => Promise<unknown>) => {
      const tx = makeMockTx(null)
      return callback(tx)
    })

    // Emails fail
    vi.mocked(enviarConfirmacionCliente).mockRejectedValue(new Error("SMTP error"))
    vi.mocked(enviarAvisoProfesional).mockRejectedValue(new Error("SMTP error"))

    const req = makeRequest("test-clinic", BASE_PAYLOAD)
    const res = await POST(req, { params: Promise.resolve({ slug: "test-clinic" }) })

    // Appointment was created and 201 returned — email failure must not block confirmation
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.citaId).toBe("cita-test-1")
    expect(body.mensaje).toBe("Reserva confirmada")
  })
})
