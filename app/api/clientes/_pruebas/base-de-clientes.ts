import { vi } from "vitest"
import { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/app/api/atenciones/_pruebas/base-falsa"
import { RELACIONES } from "@/app/api/atenciones/_pruebas/consultas-falsas"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/app/api/atenciones/_pruebas/datos"

/**
 * La base falsa del tablero (`app/api/atenciones/_pruebas/`) con lo que piden
 * los endpoints de clientes y el tablero no usaba. Se extiende desde acá
 * porque esa carpeta es de otra ficha.
 *
 * La relación `customer.appointments` existe en el esquema real. Se registra
 * al importar este archivo y vale sólo para los archivos de test que lo
 * importan, porque vitest aísla los módulos de cada archivo. Con ella, el
 * historial anidado se filtra de verdad con el `where` de `whereDeAgenda`, y
 * un operador que la base no entienda sigue lanzando (F-018).
 */
RELACIONES.customer.appointments = { modelo: "appointment", tipo: "muchos", local: "id", remoto: "customerId" }

type Registro = Record<string, unknown>

/** La base falsa, más `customer.delete`, que el tablero no usa. */
export function crearBaseDeClientes() {
  const base = crearBaseFalsa()

  /** Como Prisma: borra por un `where` único, y si no hay a quién, lanza P2025. */
  const borrar = vi.fn(async (args: { where: Registro }) => {
    const [registro] = base.buscar("customer", args.where)
    if (!registro) {
      throw new Prisma.PrismaClientKnownRequestError("No existe el registro a borrar en customer", {
        code: "P2025",
        clientVersion: "base-falsa",
      })
    }
    await base.prisma.customer.deleteMany({ where: { id: registro.id } })
    return registro
  })

  return { ...base, prisma: { ...base.prisma, customer: { ...base.prisma.customer, delete: borrar } } }
}

/** Una cita del negocio 1, de media hora, salvo lo que se pise. */
function cita(id: string, inicio: string, datos: Registro): Registro {
  const startTime = new Date(inicio)
  return {
    id,
    businessId: NEGOCIO,
    title: "Corte",
    status: "completada",
    startTime,
    endTime: new Date(startTime.getTime() + 30 * 60_000),
    ...datos,
  }
}

/**
 * Las personas, negocios y clientes del tablero (`datosBase`), con el
 * historial de María repartido entre Carla, Pedro y la página pública. Las
 * citas de Pedro traen lo que Carla no tiene que ver: notas internas,
 * comentarios del cliente y precio.
 */
export function escenarioDeClientes() {
  return {
    ...datosBase(),
    appointment: [
      cita("cita-carla", "2026-09-01T13:00:00.000Z", {
        customerId: "c-maria",
        memberId: "m-carla",
        price: 8000,
        notes: "Nota interna de Carla",
        clientComments: "Prefiere la tarde",
      }),
      cita("cita-pedro", "2026-09-10T13:00:00.000Z", {
        customerId: "c-maria",
        memberId: "m-pedro",
        title: "Color",
        price: 25000,
        notes: "Nota interna de Pedro: alérgica al amoníaco",
        clientComments: "Traigo una foto de referencia",
      }),
      cita("cita-pedro-otra", "2026-09-20T13:00:00.000Z", {
        customerId: "c-maria",
        memberId: "m-pedro",
        title: "Color",
        price: 25000,
      }),
      // De la página pública, sin profesional: la ven la dueña y el encargado.
      cita("cita-publica", "2026-10-15T13:00:00.000Z", {
        customerId: "c-maria",
        memberId: null,
        title: "Peinado",
        status: "pendiente",
        clientComments: "Reservé por la web",
      }),
      // Inconsistente a propósito: una cita del otro negocio que apunta a
      // María. Ningún endpoint la crea así, pero si existiera, no se ve.
      cita("cita-cruzada", "2026-10-01T13:00:00.000Z", {
        businessId: OTRO_NEGOCIO,
        customerId: "c-maria",
        memberId: "m-ajeno",
        price: 9000,
        notes: "Nota del otro negocio",
      }),
      // Beto sólo se atendió con Pedro: para Carla existe, pero sin historial.
      cita("cita-beto", "2026-09-05T13:00:00.000Z", { customerId: "c-beto", memberId: "m-pedro", price: 8000 }),
      cita("cita-ajena", "2026-09-01T13:00:00.000Z", {
        businessId: OTRO_NEGOCIO,
        customerId: "c-ajeno",
        memberId: "m-ajeno",
        price: 9000,
      }),
    ],
  }
}
