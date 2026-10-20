import { describe, expect, it, vi } from "vitest"

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect }))

import PaginaChats from "./page"

describe("/dashboard/chats", () => {
  it("redirige al inicio del panel mientras Chats está escondido", () => {
    PaginaChats()
    expect(redirect).toHaveBeenCalledWith("/dashboard")
  })
})
