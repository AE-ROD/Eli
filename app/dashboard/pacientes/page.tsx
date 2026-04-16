"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/eli/app/barra-superior"
import { TarjetaPaciente, type Paciente } from "@/components/eli/app/tarjeta-paciente"
import { AvatarUsuario } from "@/components/eli/app/avatar-usuario"
import { BotonPrimario } from "@/components/eli/app/boton-primario"
import { CampoFormulario } from "@/components/eli/app/campo-formulario"
import {
  Search,
  Filter,
  Grid3X3,
  List,
  X,
  Phone,
  Mail,
  Calendar,
  Clock,
  FileText,
  Tag,
  User,
} from "lucide-react"

// Datos de ejemplo
const pacientesData: Paciente[] = [
  { id: "1", nombre: "María García", email: "maria@email.com", telefono: "+52 555 123 4567", visitas: 12, ultimaVisita: "Hace 2 días", etiqueta: "VIP" },
  { id: "2", nombre: "Carlos Rodríguez", email: "carlos@email.com", telefono: "+52 555 234 5678", visitas: 5, ultimaVisita: "Hace 1 semana", etiqueta: "Frecuente" },
  { id: "3", nombre: "Ana Pérez", email: "ana@email.com", telefono: "+52 555 345 6789", visitas: 2, ultimaVisita: "Hace 2 semanas", etiqueta: "Nuevo" },
  { id: "4", nombre: "Luis Martínez", email: "luis@email.com", telefono: "+52 555 456 7890", visitas: 8, ultimaVisita: "Hace 3 días", etiqueta: "Frecuente" },
  { id: "5", nombre: "Sofia Hernández", email: "sofia@email.com", telefono: "+52 555 567 8901", visitas: 15, ultimaVisita: "Ayer", etiqueta: "VIP" },
  { id: "6", nombre: "Pedro López", email: "pedro@email.com", telefono: "+52 555 678 9012", visitas: 1, ultimaVisita: "Hace 1 mes", etiqueta: "Inactivo" },
  { id: "7", nombre: "Laura Torres", email: "laura@email.com", telefono: "+52 555 789 0123", visitas: 6, ultimaVisita: "Hace 5 días", etiqueta: "Frecuente" },
  { id: "8", nombre: "Diego Ramírez", email: "diego@email.com", telefono: "+52 555 890 1234", visitas: 3, ultimaVisita: "Hace 1 semana", etiqueta: "Nuevo" },
]

const etiquetas = ["Todos", "VIP", "Frecuente", "Nuevo", "Inactivo"]

type VistaLista = "grid" | "lista"

export default function PacientesPage() {
  const [busqueda, setBusqueda] = useState("")
  const [etiquetaActiva, setEtiquetaActiva] = useState("Todos")
  const [vista, setVista] = useState<VistaLista>("grid")
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null)
  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false)

  const pacientesFiltrados = pacientesData.filter((p) => {
    const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.email.toLowerCase().includes(busqueda.toLowerCase())
    const coincideEtiqueta = etiquetaActiva === "Todos" || p.etiqueta === etiquetaActiva
    return coincideBusqueda && coincideEtiqueta
  })

  const historialCitas = [
    { fecha: "15 Abr 2024", servicio: "Corte + Tinte", precio: "$850" },
    { fecha: "1 Abr 2024", servicio: "Corte de cabello", precio: "$350" },
    { fecha: "15 Mar 2024", servicio: "Manicure", precio: "$250" },
    { fecha: "1 Mar 2024", servicio: "Corte + Tinte", precio: "$850" },
  ]

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Pacientes"
        subtitulo={`${pacientesData.length} clientes registrados`}
        accionPrincipal={{
          texto: "Nuevo paciente",
          onClick: () => setModalNuevoAbierto(true),
        }}
      />

      <div className="p-6">
        {/* Filtros y busqueda */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Busqueda */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Etiquetas */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
            {etiquetas.map((etiqueta) => (
              <button
                key={etiqueta}
                onClick={() => setEtiquetaActiva(etiqueta)}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all
                  ${etiquetaActiva === etiqueta
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  }
                `}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          {/* Vista */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
            <button
              onClick={() => setVista("grid")}
              className={`p-2 rounded-md transition-colors ${vista === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setVista("lista")}
              className={`p-2 rounded-md transition-colors ${vista === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Lista de pacientes */}
          <div className="flex-1">
            <motion.div
              className={vista === "grid" ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" : "space-y-3"}
              layout
            >
              <AnimatePresence mode="popLayout">
                {pacientesFiltrados.map((paciente) => (
                  <motion.div
                    key={paciente.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    <TarjetaPaciente
                      paciente={paciente}
                      onClick={() => setPacienteSeleccionado(paciente)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>

            {pacientesFiltrados.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">No se encontraron pacientes</h3>
                <p className="text-muted-foreground text-sm">
                  Intenta cambiar los filtros o agregar un nuevo paciente
                </p>
              </div>
            )}
          </div>

          {/* Panel de detalle */}
          <AnimatePresence>
            {pacienteSeleccionado && (
              <motion.aside
                className="w-96 bg-card border border-border/50 rounded-xl overflow-hidden hidden lg:block"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                {/* Header */}
                <div className="relative bg-primary/5 p-6 pb-16">
                  <button
                    onClick={() => setPacienteSeleccionado(null)}
                    className="absolute top-4 right-4 p-1 rounded-lg hover:bg-background/50 transition-colors"
                  >
                    <X className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <div className="absolute -bottom-10 left-6">
                    <AvatarUsuario nombre={pacienteSeleccionado.nombre} tamaño="xl" />
                  </div>
                </div>

                <div className="p-6 pt-14">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-foreground">{pacienteSeleccionado.nombre}</h3>
                      {pacienteSeleccionado.etiqueta && (
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          pacienteSeleccionado.etiqueta === "VIP" ? "bg-amber-100 text-amber-700" :
                          pacienteSeleccionado.etiqueta === "Frecuente" ? "bg-green-100 text-green-700" :
                          pacienteSeleccionado.etiqueta === "Nuevo" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {pacienteSeleccionado.etiqueta}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Info de contacto */}
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{pacienteSeleccionado.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{pacienteSeleccionado.telefono}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{pacienteSeleccionado.visitas} visitas totales</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Última visita: {pacienteSeleccionado.ultimaVisita}</span>
                    </div>
                  </div>

                  {/* Acciones rapidas */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    <BotonPrimario tamaño="sm" anchoCompleto>
                      Agendar cita
                    </BotonPrimario>
                    <BotonPrimario variante="secundario" tamaño="sm" anchoCompleto>
                      Enviar mensaje
                    </BotonPrimario>
                  </div>

                  {/* Historial */}
                  <div>
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Historial de citas
                    </h4>
                    <div className="space-y-2">
                      {historialCitas.map((cita, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">{cita.servicio}</p>
                            <p className="text-xs text-muted-foreground">{cita.fecha}</p>
                          </div>
                          <span className="text-sm font-medium text-foreground">{cita.precio}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Notas */}
                  <div className="mt-6">
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Notas
                    </h4>
                    <textarea
                      placeholder="Agregar notas sobre el paciente..."
                      className="w-full p-3 rounded-lg border border-border bg-background text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modal nuevo paciente */}
      <AnimatePresence>
        {modalNuevoAbierto && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
              onClick={() => setModalNuevoAbierto(false)}
            />
            <motion.div
              className="relative bg-card rounded-xl shadow-xl w-full max-w-md p-6"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-foreground">Nuevo paciente</h2>
                <button
                  onClick={() => setModalNuevoAbierto(false)}
                  className="p-1 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form className="space-y-4">
                <CampoFormulario
                  etiqueta="Nombre completo"
                  placeholder="Nombre del paciente"
                  icono={<User className="h-4 w-4" />}
                />
                <CampoFormulario
                  etiqueta="Correo electrónico"
                  type="email"
                  placeholder="email@ejemplo.com"
                  icono={<Mail className="h-4 w-4" />}
                />
                <CampoFormulario
                  etiqueta="Teléfono"
                  type="tel"
                  placeholder="+52 555 123 4567"
                  icono={<Phone className="h-4 w-4" />}
                />

                <div className="flex gap-3 pt-4">
                  <BotonPrimario
                    type="button"
                    variante="secundario"
                    anchoCompleto
                    onClick={() => setModalNuevoAbierto(false)}
                  >
                    Cancelar
                  </BotonPrimario>
                  <BotonPrimario type="submit" anchoCompleto>
                    Guardar paciente
                  </BotonPrimario>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
