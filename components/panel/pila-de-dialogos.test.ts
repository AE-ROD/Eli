import { describe, expect, it } from "vitest"
import { crearPilaDeDialogos, destinoAlCerrar, type DialogoEnLaPila } from "./pila-de-dialogos"

/** Un elemento de mentira: sólo lo que la pila mira. */
interface Elemento {
  nombre: string
  isConnected: boolean
}
const elemento = (nombre: string, isConnected = true): Elemento => ({ nombre, isConnected })

function dialogo(adentro: Elemento[], destino: () => Elemento | null = () => null): DialogoEnLaPila<Elemento> {
  return { contiene: (e) => adentro.includes(e), destinoAlCerrar: destino }
}

describe("crearPilaDeDialogos", () => {
  it("sólo el de arriba atiende; al cerrarlo, vuelve a atender el de abajo", () => {
    const pila = crearPilaDeDialogos<Elemento>()
    const detalle = dialogo([])
    const confirmacion = dialogo([])
    pila.abrir(detalle)
    const cerrarConfirmacion = pila.abrir(confirmacion)

    expect(pila.esElDeArriba(confirmacion)).toBe(true)
    expect(pila.esElDeArriba(detalle)).toBe(false)

    cerrarConfirmacion()
    expect(pila.esElDeArriba(detalle)).toBe(true)
  })

  it("se puede cerrar el de abajo primero, y cerrar dos veces no borra a otro", () => {
    const pila = crearPilaDeDialogos<Elemento>()
    const a = dialogo([])
    const b = dialogo([])
    const cerrarA = pila.abrir(a)
    pila.abrir(b)

    cerrarA()
    cerrarA()
    expect(pila.esElDeArriba(b)).toBe(true)
  })

  it("contenedorDe dice en qué diálogo abierto está un elemento", () => {
    const pila = crearPilaDeDialogos<Elemento>()
    const boton = elemento("Cerrar liquidación")
    const vistaPrevia = dialogo([boton])
    pila.abrir(vistaPrevia)

    expect(pila.contenedorDe(boton)).toBe(vistaPrevia)
    expect(pila.contenedorDe(elemento("afuera"))).toBeNull()
  })
})

describe("destinoAlCerrar", () => {
  it("lo que abrió el diálogo, si sigue en la página", () => {
    const boton = elemento("Nueva cita")
    expect(destinoAlCerrar(boton, null)).toBe(boton)
  })

  it("si lo que lo abrió estaba en un diálogo que se reemplazó, va adonde iría aquél", () => {
    // La vista previa (abierta desde la fila del equipo) se reemplaza por la
    // confirmación; su botón ya no está. Al cerrar, el foco no cae al <body>.
    const filaDelEquipo = elemento("Liquidar a Ana")
    const botonDeLaVistaPrevia = elemento("Cerrar liquidación", false)
    const vistaPrevia = dialogo([botonDeLaVistaPrevia], () => destinoAlCerrar(filaDelEquipo, null))

    expect(destinoAlCerrar(botonDeLaVistaPrevia, vistaPrevia)).toBe(filaDelEquipo)
  })

  it("encadena: confirmación → vista previa otra vez → la fila del equipo", () => {
    const filaDelEquipo = elemento("Liquidar a Ana")
    const primera = dialogo([], () => destinoAlCerrar(filaDelEquipo, null))
    const botonDeLaConfirmacion = elemento("Volver a la vista previa", false)
    const confirmacion = dialogo([botonDeLaConfirmacion], () => destinoAlCerrar(elemento("Cerrar liquidación", false), primera))

    expect(destinoAlCerrar(botonDeLaConfirmacion, confirmacion)).toBe(filaDelEquipo)
  })

  it("sin nada que siga en la página, ninguno", () => {
    expect(destinoAlCerrar(elemento("ya no está", false), null)).toBeNull()
    expect(destinoAlCerrar(null, null)).toBeNull()
  })
})
