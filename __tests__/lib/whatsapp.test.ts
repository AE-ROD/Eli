import { beforeEach, describe, expect, it, vi } from "vitest"

const { twilioFactory } = vi.hoisted(() => ({ twilioFactory: vi.fn() }))

vi.mock("twilio", () => ({ default: twilioFactory }))

import { getClient, toWhatsApp } from "@/lib/whatsapp"

describe("WhatsApp helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
  })

  it("normalizes formatted phone numbers to the Twilio WhatsApp address", () => {
    expect(toWhatsApp("+56 (9) 8765-4321")).toBe("whatsapp:+56987654321")
  })

  it("returns null without constructing the Twilio SDK when credentials are absent", () => {
    expect(getClient()).toBeNull()
    expect(twilioFactory).not.toHaveBeenCalled()
  })
})
