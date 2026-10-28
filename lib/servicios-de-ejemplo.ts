import type { RubroId } from "./rubros"

/**
 * Los servicios con que nace un negocio, según su rubro, para que la página
 * de reservas y la agenda no arranquen vacías. Son servicios comunes, con
 * duraciones y precios de referencia en pesos chilenos (2026): el dueño los
 * edita o los borra como cualquier otro desde Configuración → Servicios.
 *
 * Duración en minutos, múltiplo de 15 y dentro de lo que acepta `duracion()`
 * (`lib/campos-del-panel.ts`); precio en pesos, como `Service.price`.
 */
export interface ServicioDeEjemplo {
  name: string
  duration: number
  price: number
  category: string
}

const SERVICIOS_POR_RUBRO: Record<RubroId, readonly ServicioDeEjemplo[]> = {
  salon: [
    { name: "Corte de pelo", duration: 45, price: 15000, category: "Corte" },
    { name: "Brushing", duration: 45, price: 12000, category: "Peinado" },
    { name: "Tintura completa", duration: 120, price: 35000, category: "Color" },
    { name: "Mechas o balayage", duration: 180, price: 60000, category: "Color" },
    { name: "Tratamiento de hidratación", duration: 45, price: 18000, category: "Tratamientos" },
  ],
  barberia: [
    { name: "Corte de pelo", duration: 30, price: 10000, category: "Corte" },
    { name: "Corte y barba", duration: 60, price: 15000, category: "Corte y barba" },
    { name: "Perfilado de barba", duration: 30, price: 7000, category: "Barba" },
    { name: "Afeitado clásico con toalla caliente", duration: 45, price: 10000, category: "Barba" },
    { name: "Corte infantil", duration: 30, price: 8000, category: "Corte" },
  ],
  "spa-de-unas": [
    { name: "Manicure tradicional", duration: 45, price: 10000, category: "Manos" },
    { name: "Esmaltado permanente", duration: 60, price: 15000, category: "Manos" },
    { name: "Uñas acrílicas", duration: 120, price: 30000, category: "Manos" },
    { name: "Pedicure spa", duration: 60, price: 18000, category: "Pies" },
    { name: "Retiro de esmaltado permanente", duration: 15, price: 5000, category: "Extras" },
  ],
}

/**
 * Los servicios de ejemplo del rubro, listos para crear. Un rubro que el
 * catálogo no conoce no recibe ninguno: es mejor nacer sin servicios que con
 * los de otro rubro. Copias nuevas en cada llamada: quien las crea no
 * comparte objetos con la lista.
 */
export function serviciosDeEjemplo(rubro: string): ServicioDeEjemplo[] {
  const lista = Object.hasOwn(SERVICIOS_POR_RUBRO, rubro) ? SERVICIOS_POR_RUBRO[rubro as RubroId] : []
  return lista.map((servicio) => ({ ...servicio }))
}
