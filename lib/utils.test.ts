import { describe, it, expect } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("combina clases simples", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4")
  })

  it("ignora valores falsy", () => {
    expect(cn("px-2", false, null, undefined, "py-4")).toBe("px-2 py-4")
  })

  it("resuelve conflictos de Tailwind quedándose con la última clase", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })
})
