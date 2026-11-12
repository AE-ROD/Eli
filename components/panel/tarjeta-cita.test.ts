import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { TarjetaCita, type CitaEnTarjeta } from "./tarjeta-cita"

// El rubro del panel lee la sesión; acá no hay sesión.
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }))

/*
 * La tarjeta de una hora con la sede (etapa 9, plan Independiente con varias
 * sedes): una insignia discreta junto a la hora, sólo cuando se le pasa
 * `sede`. Sin ella, la tarjeta es exactamente la de siempre.
 */

const CITA: CitaEnTarjeta = {
  id: "c1",
  nombreCliente: "Ana Pérez",
  servicio: "Corte",
  horaInicio: "10:00",
  horaFin: "11:00",
  duracion: 60,
  estado: "confirmada",
}

const pintar = (cita: CitaEnTarjeta, compacta: boolean) => renderToString(createElement(TarjetaCita, { cita, compacta }))
/** El texto visible: sin etiquetas, para buscar frases enteras (React parte el texto con comentarios). */
const texto = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

describe("TarjetaCita: la sede", () => {
  it.each([[true], [false]])("con sede (compacta: %s), la dice, con el nombre y un pin que no se lee", (compacta) => {
    const html = pintar({ ...CITA, sede: "Providencia" }, compacta)

    expect(texto(html)).toContain("Providencia")
    expect(html).toContain("lucide-map-pin")
    // El lector de pantalla oye "Sede Providencia"; el dibujo del pin es decoración.
    expect(html).toContain('<span class="sr-only">Sede </span>')
    expect(html).toMatch(/<svg[^>]*lucide-map-pin[^>]*aria-hidden="true"/)
  })

  it("la insignia va junto a la hora, antes del estado, en la tarjeta compacta", () => {
    const html = texto(pintar({ ...CITA, sede: "Providencia" }, true))

    expect(html.indexOf("10:00")).toBeLessThan(html.indexOf("Providencia"))
    expect(html.indexOf("Providencia")).toBeLessThan(html.indexOf("Confirmada"))
  })

  it("un nombre largo se corta con puntos suspensivos en vez de ensanchar la tarjeta", () => {
    const html = pintar({ ...CITA, sede: "Sede de la avenida más larga de todo el barrio alto" }, true)

    expect(html).toMatch(/class="[^"]*\btruncate\b[^"]*">Sede de la avenida/)
  })

  it.each([[true], [false]])("sin sede (compacta: %s), la tarjeta es la de siempre: ni insignia ni pin", (compacta) => {
    const sinSede = pintar(CITA, compacta)

    expect(sinSede).not.toContain("lucide-map-pin")
    expect(texto(sinSede)).not.toMatch(/Sede/)
    // `sede` indefinida es lo mismo que no pasarla.
    expect(pintar({ ...CITA, sede: undefined }, compacta)).toBe(sinSede)
  })
})
