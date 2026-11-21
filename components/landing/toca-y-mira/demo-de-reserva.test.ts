import { describe, expect, it } from "vitest"
import {
  DIAS_DE_EJEMPLO,
  ESTADO_INICIAL,
  avanzarLaDemo,
  numeroDelPaso,
  type EstadoDeLaDemo,
} from "./demo-de-reserva"

describe("avanzarLaDemo", () => {
  it("llega a listo en tres toques: servicio, hora y nada más", () => {
    let estado: EstadoDeLaDemo = ESTADO_INICIAL
    expect(numeroDelPaso(estado)).toBe(1)
    estado = avanzarLaDemo(estado, { tipo: "elegir-servicio", servicio: "color-corte" })
    expect(estado).toEqual({ paso: "hora", servicio: "color-corte", dia: DIAS_DE_EJEMPLO[0].id })
    expect(numeroDelPaso(estado)).toBe(2)
    estado = avanzarLaDemo(estado, { tipo: "elegir-hora", hora: "10:30" })
    expect(estado).toEqual({ paso: "listo", servicio: "color-corte", dia: "15", hora: "10:30" })
    expect(numeroDelPaso(estado)).toBe(3)
  })

  it("cambiar de día no avanza y queda en el resumen", () => {
    let estado = avanzarLaDemo(ESTADO_INICIAL, { tipo: "elegir-servicio", servicio: "corte" })
    estado = avanzarLaDemo(estado, { tipo: "elegir-dia", dia: "17" })
    expect(estado).toEqual({ paso: "hora", servicio: "corte", dia: "17" })
    estado = avanzarLaDemo(estado, { tipo: "elegir-hora", hora: "15:00" })
    expect(estado).toEqual({ paso: "listo", servicio: "corte", dia: "17", hora: "15:00" })
  })

  it("ignora lo que no corresponde al paso o no existe", () => {
    expect(avanzarLaDemo(ESTADO_INICIAL, { tipo: "elegir-hora", hora: "10:30" })).toBe(ESTADO_INICIAL)
    expect(avanzarLaDemo(ESTADO_INICIAL, { tipo: "elegir-dia", dia: "16" })).toBe(ESTADO_INICIAL)
    expect(avanzarLaDemo(ESTADO_INICIAL, { tipo: "elegir-servicio", servicio: "no-existe" })).toBe(ESTADO_INICIAL)
    const enHora = avanzarLaDemo(ESTADO_INICIAL, { tipo: "elegir-servicio", servicio: "corte" })
    expect(avanzarLaDemo(enHora, { tipo: "elegir-servicio", servicio: "color" })).toBe(enHora)
    expect(avanzarLaDemo(enHora, { tipo: "elegir-hora", hora: "23:59" })).toBe(enHora)
    expect(avanzarLaDemo(enHora, { tipo: "elegir-dia", dia: "99" })).toBe(enHora)
  })

  it("volver a probar empieza de nuevo", () => {
    let estado = avanzarLaDemo(ESTADO_INICIAL, { tipo: "elegir-servicio", servicio: "manicura" })
    estado = avanzarLaDemo(estado, { tipo: "elegir-hora", hora: "09:30" })
    expect(avanzarLaDemo(estado, { tipo: "volver-a-probar" })).toEqual(ESTADO_INICIAL)
  })
})
