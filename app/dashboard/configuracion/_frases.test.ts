import { describe, expect, it } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeConfiguracion } from "./_frases"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras

const NEUTRAS = palabrasDe(null)

/**
 * Un rubro inventado con otros géneros que los reales: el servicio femenino
 * (como la prestación), el turno masculino y la clienta femenina. Si una frase
 * pegara "el", "lo" o "nuevo" a mano, acá se rompe.
 */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  servicio: { singular: "labor", plural: "labores", genero: "f" },
  cita: { singular: "turno", plural: "turnos", genero: "m" },
  tablero: { singular: "mostrador", plural: "mostradores", genero: "m" },
  negocio: { singular: "taller", plural: "talleres", genero: "m" },
}

describe("sin rubro: exactamente los textos de siempre", () => {
  const f = frasesDeConfiguracion(NEUTRAS)

  it("la página y el horario", () => {
    expect(f.pagina.subtitulo(true)).toBe("Gestiona horarios, servicios y equipo")
    expect(f.pagina.subtitulo(false)).toBe("Gestiona tu horario de atención")
    expect(f.pagina.negocioSinNombre).toBe("El negocio")
    expect(f.horario.general).toBe("Horario general del negocio")
    expect(f.horario.usaElDelNegocio).toBe("Usa el horario del negocio")
    expect(f.horario.negocioSinHorario).toBe(
      "No tiene horario propio y el negocio todavía no guardó el suyo, así que no ofrece horas. Marca sus días y guarda para darle un horario propio."
    )
    expect(f.horario.atiendeEnElDelNegocio).toBe(
      "No tiene horario propio: atiende en el del negocio, que es el que ves. Si lo cambias y guardas, pasa a tener el suyo."
    )
    expect(f.horario.sinGuardar).toBe(
      "Tus clientes no ven horas hasta que lo guardes. Revisa los días y las horas, y toca “Guardar horario”."
    )
  })

  it("la página pública y mi foto", () => {
    expect(f.paginaPublica.subtitulo).toBe("Lo que ven tus clientes al reservar.")
    expect(f.paginaPublica.whatsapp).toBe("WhatsApp del negocio")
    expect(f.paginaPublica.fotos).toBe(
      "Las fotos se guardan al subirlas: no hace falta apretar “Guardar”. La foto de cada profesional se sube en Equipo, o en “Mi foto” por quien atiende."
    )
    expect(f.paginaPublica.especialidad).toBe("Especialidad de cada profesional")
    expect(f.paginaPublica.ayudaDeLasResenas).toBe(
      "Lo copias desde tu Perfil de Empresa en Google, en «Pedir reseñas». Se usa en el correo que pide una reseña el día después de la visita, si lo activas en Mensajes a clientes."
    )
    expect(f.miFoto.subtitulo(true)).toBe("Es la que ven tus clientes en la página de reservas, junto a tu nombre.")
    expect(f.miFoto.subtitulo(false)).toBe("Se ve en la lista del equipo. En la página de reservas sólo salen quienes atienden.")
  })

  it("la fila virtual", () => {
    expect(f.filaVirtual.subtitulo).toBe("Para atender por orden de llegada sin que esperen en el local")
    expect(f.filaVirtual.descripcion).toBe(
      "Tus clientes se anotan desde su celular mientras el local está abierto, ven cuántas personas tienen adelante y les avisamos por correo cuando ya casi es su turno."
    )
    expect(f.filaVirtual.pantalla).toBe(
      "La pantalla usa la sesión de quien la abre: en el televisor o la tablet del local queda abierto el panel de esa cuenta. Déjala en pantalla completa y no dejes el panel a mano de los clientes en ese equipo."
    )
  })

  it("el plazo, las faltas y la hora valle", () => {
    expect(f.plazoDeCambios.subtitulo).toBe("Tus clientes reciben un enlace en el correo de confirmación")
    expect(f.plazoDeCambios.ayuda).toBe(
      "Hasta cuántas horas antes de la cita pueden hacerlo solos, de 0 a 72. Después, el enlace les pide que te contacten."
    )
    expect(f.porConfirmar.ayuda(1, 5)).toBe(
      "De 1 a 5. Cuentan las citas marcadas “No vino” con el mismo correo de quien reserva; el teléfono no cuenta, y una reserva sin correo nunca entra por confirmar."
    )
    expect(f.horaValle.descripcion).toBe(
      "Quien reserva por tu página a una hora de estas franjas paga menos: lo ve en las horas y en el resumen. Cuenta la hora en que empieza la cita. Las citas que anotas en la agenda no se rebajan solas."
    )
    expect(f.horaValle.sinRebaja).toBe("Servicios sin rebaja")
    expect(f.horaValle.sinRebajaAyuda).toBe("Los marcados cuestan lo mismo a cualquier hora.")
  })

  it("los servicios", () => {
    expect(f.servicios.titulo).toBe("Servicios")
    expect(f.servicios.subtitulo).toBe("Los servicios que ofreces a tus clientes")
    expect(f.servicios.nuevo).toBe("Nuevo servicio")
    expect(f.servicios.sinServicios).toEqual({ titulo: "Sin servicios aún", ayuda: "Agrega el primer servicio que ofreces" })
    expect(f.servicios.activo("Corte")).toBe("Servicio activo: Corte")
    expect(f.servicios.eliminar.descripcion).toBe(
      "No se puede deshacer. Si sólo quieres dejar de ofrecerlo por un tiempo, desactívalo con su interruptor: sale de la página pública y lo vuelves a encender cuando quieras."
    )
    expect(f.servicios.eliminar.confirmar).toBe("Eliminar servicio")
    expect(f.servicios.modal.titulo(false)).toBe("Nuevo servicio")
    expect(f.servicios.modal.titulo(true)).toBe("Editar servicio")
    expect(f.servicios.modal.antetitulo).toBe("Servicios")
    expect(f.servicios.modal.nombre).toBe("Nombre del servicio")
    expect(f.servicios.modal.descripcionPlaceholder).toBe("Describe brevemente el servicio...")
    expect(f.servicios.modal.crear).toBe("Crear servicio")
    expect(f.servicios.modal.frecuencia).toBe("Cada cuántos días vuelve un cliente (opcional)")
  })

  it("productos, sillones y mensajes", () => {
    expect(f.productos.subtitulo).toBe("Lo que vendes además de tus servicios")
    expect(f.productos.vacio).toBe("Agrega lo que vendes en el local para anotarlo en el tablero")
    expect(f.mensajes.titulo).toBe("Mensajes a clientes")
    expect(f.mensajes.listaDeEspera).toBe(
      "Si un día no tiene horas, tus clientes se anotan y les avisamos por correo cuando se libere una."
    )
    expect(f.mensajes.avisoDeVuelta).toEqual({
      etiqueta: "Te toca volver",
      descripcion: "Un correo cuando a un cliente ya le toca volver, según cada cuánto viene o la frecuencia de su servicio.",
    })
    expect(f.mensajes.soloConConsentimiento).toBe(
      "“Te toca volver” y “Pedir reseña” sólo les llegan a quienes aceptaron recibir avisos y novedades de tu negocio por correo, y cada correo trae cómo darse de baja. La lista de espera le llega a quien se anotó."
    )
  })

  it("los errores de los pedidos", () => {
    expect(f.errores).toEqual({
      crearServicio: "No se pudo crear el servicio",
      guardarServicio: "No se pudo guardar el servicio",
      activarServicio: "No se pudo activar el servicio",
      desactivarServicio: "No se pudo desactivar el servicio",
      borrarServicio: "No se pudo borrar el servicio",
    })
  })
})

describe("los rubros sin palabras propias hablan como sin rubro", () => {
  it.each(["salud", "fitness", "otro", "", "constructor", undefined])("%s", (rubro) => {
    const texto = (palabras: PalabrasDelRubro) =>
      JSON.stringify(frasesDeConfiguracion(palabras), (_, v) => (typeof v === "function" ? [v(true), v(false)] : v))
    expect(texto(palabrasDe(rubro as string | null))).toBe(texto(NEUTRAS))
  })
})

describe("salón, barbería y salón de uñas: la reserva es una hora, sin chocar con el reloj", () => {
  for (const rubro of ["salon", "barberia", "spa-de-unas"]) {
    it(rubro, () => {
      const f = frasesDeConfiguracion(palabrasDe(rubro))
      // "horas antes de la hora" y "la hora en que empieza la hora" se leerían como reloj.
      expect(f.plazoDeCambios.ayuda).toBe(
        "Hasta cuántas horas antes pueden hacerlo solos, de 0 a 72. Después, el enlace les pide que te contacten."
      )
      expect(f.horaValle.descripcion).toBe(
        "Quien reserva por tu página a una hora de estas franjas paga menos: lo ve en las horas y en el resumen. Cuenta la hora de inicio. Las horas que anotas en la agenda no se rebajan solas."
      )
      expect(f.porConfirmar.ayuda(1, 5)).toContain("Cuentan las horas marcadas “No vino” con el mismo correo")
      expect(f.servicios.titulo).toBe("Servicios")
    })
  }

  it("el negocio, con su artículo y su género", () => {
    const salon = frasesDeConfiguracion(palabrasDe("salon"))
    expect(salon.horario.general).toBe("Horario general del salón")
    expect(salon.horario.atiendeEnElDelNegocio).toContain("atiende en el del salón")
    expect(salon.filaVirtual.subtitulo).toBe("Para atender por orden de llegada sin que esperen en el salón")
    expect(salon.filaVirtual.descripcion).toContain("mientras el salón está abierto")

    const barberia = frasesDeConfiguracion(palabrasDe("barberia"))
    expect(barberia.horario.general).toBe("Horario general de la barbería")
    expect(barberia.horario.negocioSinHorario).toContain("y la barbería todavía no guardó el suyo")
    expect(barberia.horario.atiendeEnElDelNegocio).toContain("atiende en el de la barbería")
    expect(barberia.filaVirtual.descripcion).toContain("mientras la barbería está abierta")
    expect(barberia.filaVirtual.pantalla).toContain("la tablet de la barbería queda abierto el panel")
    expect(barberia.paginaPublica.especialidad).toBe("Especialidad de cada barbero")
    expect(barberia.pagina.negocioSinNombre).toBe("La barbería")

    const unas = frasesDeConfiguracion(palabrasDe("spa-de-unas"))
    expect(unas.paginaPublica.whatsapp).toBe("WhatsApp del salón de uñas")
    expect(unas.productos.vacio).toBe("Agrega lo que vendes en el salón de uñas para anotarlo en el tablero")
    expect(frasesDeConfiguracion(palabrasDe("salon")).paginaPublica.especialidad).toBe("Especialidad de cada estilista")
  })
})

describe("clínica dental: prestaciones, pacientes y sala de espera", () => {
  const f = frasesDeConfiguracion(palabrasDe("odontologia"))

  it("las prestaciones son femeninas", () => {
    expect(f.pagina.subtitulo(true)).toBe("Gestiona horarios, prestaciones y equipo")
    expect(f.servicios.titulo).toBe("Prestaciones")
    expect(f.servicios.subtitulo).toBe("Las prestaciones que ofreces a tus pacientes")
    expect(f.servicios.nuevo).toBe("Nueva prestación")
    expect(f.servicios.sinServicios).toEqual({ titulo: "Sin prestaciones aún", ayuda: "Agrega la primera prestación que ofreces" })
    expect(f.servicios.activo("Limpieza")).toBe("Prestación activa: Limpieza")
    expect(f.servicios.eliminar.descripcion).toBe(
      "No se puede deshacer. Si sólo quieres dejar de ofrecerla por un tiempo, desactívala con su interruptor: sale de la página pública y la vuelves a encender cuando quieras."
    )
    expect(f.servicios.eliminar.confirmar).toBe("Eliminar prestación")
    expect(f.servicios.modal.titulo(false)).toBe("Nueva prestación")
    expect(f.servicios.modal.titulo(true)).toBe("Editar prestación")
    expect(f.servicios.modal.nombre).toBe("Nombre de la prestación")
    expect(f.servicios.modal.descripcionPlaceholder).toBe("Describe brevemente la prestación...")
    expect(f.servicios.modal.frecuencia).toBe("Cada cuántos días vuelve un paciente (opcional)")
    expect(f.mensajes.avisoDeVuelta.descripcion).toBe(
      "Un correo cuando a un paciente ya le toca volver, según cada cuánto viene o la frecuencia de su prestación."
    )
    expect(f.errores.crearServicio).toBe("No se pudo crear la prestación")
    expect(f.errores.desactivarServicio).toBe("No se pudo desactivar la prestación")
    expect(f.horaValle.sinRebajaAyuda).toBe("Las marcadas cuestan lo mismo a cualquier hora.")
  })

  it("la reserva es una cita, el control se llama Control y la sala de espera lleva su artículo", () => {
    expect(f.plazoDeCambios.ayuda).toBe(
      "Hasta cuántas horas antes de la cita pueden hacerlo solos, de 0 a 72. Después, el enlace les pide que te contacten."
    )
    expect(f.porConfirmar.ayuda(1, 5)).toContain("Cuentan las citas marcadas “No asistió” con el mismo correo")
    expect(f.mensajes.avisoDeVuelta.etiqueta).toBe("Control")
    expect(f.mensajes.soloConConsentimiento).toContain("“Control” y “Pedir reseña”")
    expect(f.mensajes.soloConConsentimiento).toContain("novedades de tu clínica por correo")
    expect(f.mensajes.titulo).toBe("Mensajes a pacientes")
    expect(f.productos.vacio).toBe("Agrega lo que vendes en la clínica para anotarlo en la sala de espera")
    expect(f.productos.subtitulo).toBe("Lo que vendes además de tus prestaciones")
  })

  it("los sillones y las citas", () => {
    expect(f.sillones.desactivados).toBe(
      "Los sillones no se borran: se desactivan. Uno desactivado no se ofrece para citas nuevas, y las citas que ya lo tienen lo conservan."
    )
    expect(f.sillones.vacio).toBe("Agrega los sillones de la clínica para ver la agenda por sillón y asignárselos a las citas.")
  })

  it("el horario del negocio", () => {
    expect(f.horario.general).toBe("Horario general de la clínica")
    expect(f.horario.usaElDelNegocio).toBe("Usa el horario de la clínica")
    expect(f.horario.sinGuardar).toContain("Tus pacientes no ven horas")
    expect(f.paginaPublica.especialidad).toBe("Especialidad de cada odontólogo")
    expect(f.paginaPublica.subtitulo).toBe("Lo que ven tus pacientes al reservar.")
    expect(f.paginaPublica.ayudaDeLasResenas).toContain("si lo activas en Mensajes a pacientes.")
  })
})

describe("la concordancia sale del género y no de las palabras de hoy: una labor femenina y un turno masculino", () => {
  const f = frasesDeConfiguracion(AL_REVES)

  it("\"la primera labor\", \"desactívala\", \"Las marcadas\", \"Nueva labor\"", () => {
    expect(f.servicios.nuevo).toBe("Nueva labor")
    expect(f.servicios.sinServicios.ayuda).toBe("Agrega la primera labor que ofreces")
    expect(f.servicios.activo("Tejido")).toBe("Labor activa: Tejido")
    expect(f.servicios.eliminar.descripcion).toContain("dejar de ofrecerla")
    expect(f.servicios.eliminar.descripcion).toContain("desactívala")
    expect(f.servicios.eliminar.descripcion).toContain("y la vuelves a encender")
    expect(f.horaValle.sinRebajaAyuda).toBe("Las marcadas cuestan lo mismo a cualquier hora.")
    expect(f.servicios.modal.frecuencia).toBe("Cada cuántos días vuelve una clienta (opcional)")
    expect(f.errores.borrarServicio).toBe("No se pudo borrar la labor")
  })

  it("\"del turno\", \"los turnos marcados\", \"solos\", \"el taller\", \"el mostrador\"", () => {
    expect(f.plazoDeCambios.ayuda).toBe(
      "Hasta cuántas horas antes del turno pueden hacerlo solas, de 0 a 72. Después, el enlace les pide que te contacten."
    )
    expect(f.porConfirmar.ayuda(1, 5)).toContain("Cuentan los turnos marcados “No vino”")
    expect(f.horaValle.descripcion).toContain("Cuenta la hora en que empieza el turno. Los turnos que anotas en la agenda no se rebajan solos.")
    expect(f.sillones.desactivados).toContain("para turnos nuevos, y los turnos que ya lo tienen lo conservan")
    expect(f.sillones.vacio).toContain("asignárselos a los turnos.")
    expect(f.pagina.negocioSinNombre).toBe("El taller")
    expect(f.productos.vacio).toBe("Agrega lo que vendes en el taller para anotarlo en el mostrador")
    expect(f.horario.atiendeEnElDelNegocio).toContain("atiende en el del taller")
  })
})
