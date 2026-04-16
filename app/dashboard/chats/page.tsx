"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/eli/app/barra-superior"
import { AvatarUsuario } from "@/components/eli/app/avatar-usuario"
import { BurbujaMensaje, type Mensaje } from "@/components/eli/app/burbuja-mensaje"
import {
  Search,
  Send,
  Paperclip,
  Smile,
  Phone,
  Video,
  MoreVertical,
  Check,
  CheckCheck,
  Image as ImageIcon,
  Calendar,
} from "lucide-react"

// Datos de ejemplo
interface Conversacion {
  id: string
  nombre: string
  imagenUrl?: string
  ultimoMensaje: string
  hora: string
  sinLeer: number
  enLinea: boolean
  mensajes: Mensaje[]
}

const conversacionesData: Conversacion[] = [
  {
    id: "1",
    nombre: "María García",
    ultimoMensaje: "¡Perfecto! Nos vemos mañana",
    hora: "10:33",
    sinLeer: 2,
    enLinea: true,
    mensajes: [
      { id: "1", texto: "Hola, quisiera confirmar mi cita de mañana", hora: "10:30", esPropio: false },
      { id: "2", texto: "¡Hola María! Sí, tienes cita mañana a las 10:00 para corte y tinte.", hora: "10:32", esPropio: true, leido: true },
      { id: "3", texto: "¿Hay algo más en lo que pueda ayudarte?", hora: "10:32", esPropio: true, leido: true },
      { id: "4", texto: "¡Perfecto! Muchas gracias", hora: "10:33", esPropio: false },
      { id: "5", texto: "¿Puedo llegar 10 minutos antes?", hora: "10:33", esPropio: false },
    ],
  },
  {
    id: "2",
    nombre: "Carlos Rodríguez",
    ultimoMensaje: "¿Tienen disponibilidad para el sábado?",
    hora: "09:15",
    sinLeer: 1,
    enLinea: false,
    mensajes: [
      { id: "1", texto: "Buenos días, quería agendar una cita", hora: "09:10", esPropio: false },
      { id: "2", texto: "Buenos días Carlos, claro que sí. ¿Para qué servicio?", hora: "09:12", esPropio: true, leido: true },
      { id: "3", texto: "Un corte de cabello", hora: "09:14", esPropio: false },
      { id: "4", texto: "¿Tienen disponibilidad para el sábado?", hora: "09:15", esPropio: false },
    ],
  },
  {
    id: "3",
    nombre: "Ana Pérez",
    ultimoMensaje: "Gracias por el recordatorio",
    hora: "Ayer",
    sinLeer: 0,
    enLinea: false,
    mensajes: [
      { id: "1", texto: "Hola Ana, te recordamos tu cita de mañana a las 3pm", hora: "14:00", esPropio: true, leido: true },
      { id: "2", texto: "Gracias por el recordatorio", hora: "14:30", esPropio: false },
    ],
  },
  {
    id: "4",
    nombre: "Luis Martínez",
    ultimoMensaje: "De acuerdo, nos vemos",
    hora: "Ayer",
    sinLeer: 0,
    enLinea: true,
    mensajes: [
      { id: "1", texto: "Buenas tardes, necesito reagendar mi cita", hora: "16:00", esPropio: false },
      { id: "2", texto: "Claro Luis, ¿qué fecha te conviene?", hora: "16:05", esPropio: true, leido: true },
      { id: "3", texto: "¿El próximo martes está disponible?", hora: "16:10", esPropio: false },
      { id: "4", texto: "Sí, tenemos espacio a las 11:00 o a las 15:00", hora: "16:12", esPropio: true, leido: true },
      { id: "5", texto: "A las 15:00 perfecto", hora: "16:15", esPropio: false },
      { id: "6", texto: "Listo, queda agendado. Te enviaré un recordatorio", hora: "16:16", esPropio: true, leido: true },
      { id: "7", texto: "De acuerdo, nos vemos", hora: "16:17", esPropio: false },
    ],
  },
  {
    id: "5",
    nombre: "Sofia Hernández",
    ultimoMensaje: "¿Cuánto cuesta el paquete completo?",
    hora: "Lun",
    sinLeer: 0,
    enLinea: false,
    mensajes: [
      { id: "1", texto: "Hola, me interesa el paquete de spa", hora: "10:00", esPropio: false },
      { id: "2", texto: "¿Cuánto cuesta el paquete completo?", hora: "10:01", esPropio: false },
    ],
  },
]

export default function ChatsPage() {
  const [busqueda, setBusqueda] = useState("")
  const [conversacionActiva, setConversacionActiva] = useState<Conversacion | null>(conversacionesData[0])
  const [nuevoMensaje, setNuevoMensaje] = useState("")
  const [mensajes, setMensajes] = useState<Mensaje[]>(conversacionesData[0]?.mensajes || [])
  const mensajesRef = useRef<HTMLDivElement>(null)

  const conversacionesFiltradas = conversacionesData.filter((c) =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  useEffect(() => {
    if (mensajesRef.current) {
      mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight
    }
  }, [mensajes])

  const seleccionarConversacion = (conv: Conversacion) => {
    setConversacionActiva(conv)
    setMensajes(conv.mensajes)
  }

  const enviarMensaje = () => {
    if (!nuevoMensaje.trim()) return

    const mensaje: Mensaje = {
      id: Date.now().toString(),
      texto: nuevoMensaje,
      hora: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
      esPropio: true,
      leido: false,
    }

    setMensajes((prev) => [...prev, mensaje])
    setNuevoMensaje("")
  }

  const respuestasRapidas = [
    "¡Hola! ¿En qué puedo ayudarte?",
    "Tu cita está confirmada",
    "Te envío los detalles por aquí",
    "¿Prefieres llamar para más información?",
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <BarraSuperior
        titulo="Chats"
        subtitulo="Comunícate con tus clientes"
        mostrarBusqueda={false}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Lista de conversaciones */}
        <aside className="w-80 border-r border-border/50 bg-card flex flex-col">
          {/* Busqueda */}
          <div className="p-4 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar conversación..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {conversacionesFiltradas.map((conv) => (
              <motion.button
                key={conv.id}
                className={`w-full p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left ${
                  conversacionActiva?.id === conv.id ? "bg-primary/5 border-l-2 border-primary" : ""
                }`}
                onClick={() => seleccionarConversacion(conv)}
                whileHover={{ x: 2 }}
              >
                <div className="relative">
                  <AvatarUsuario nombre={conv.nombre} tamaño="md" enLinea={conv.enLinea} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-foreground truncate">{conv.nombre}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{conv.hora}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground truncate pr-2">{conv.ultimoMensaje}</p>
                    {conv.sinLeer > 0 && (
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                        {conv.sinLeer}
                      </span>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </aside>

        {/* Area de chat */}
        {conversacionActiva ? (
          <div className="flex-1 flex flex-col bg-background">
            {/* Header del chat */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card">
              <div className="flex items-center gap-3">
                <AvatarUsuario 
                  nombre={conversacionActiva.nombre} 
                  tamaño="md" 
                  enLinea={conversacionActiva.enLinea} 
                />
                <div>
                  <h3 className="font-semibold text-foreground">{conversacionActiva.nombre}</h3>
                  <p className="text-xs text-muted-foreground">
                    {conversacionActiva.enLinea ? (
                      <span className="text-green-500">En línea</span>
                    ) : (
                      "Última vez hoy a las 10:33"
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                </button>
                <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <Video className="h-5 w-5 text-muted-foreground" />
                </button>
                <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </button>
                <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <MoreVertical className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </header>

            {/* Mensajes */}
            <div 
              ref={mensajesRef}
              className="flex-1 overflow-y-auto p-6 space-y-4"
            >
              {mensajes.map((mensaje) => (
                <BurbujaMensaje key={mensaje.id} mensaje={mensaje} />
              ))}
            </div>

            {/* Respuestas rapidas */}
            <div className="px-6 py-2 flex gap-2 overflow-x-auto border-t border-border/30">
              {respuestasRapidas.map((respuesta, i) => (
                <button
                  key={i}
                  onClick={() => setNuevoMensaje(respuesta)}
                  className="px-3 py-1.5 rounded-full bg-muted text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors whitespace-nowrap"
                >
                  {respuesta}
                </button>
              ))}
            </div>

            {/* Input de mensaje */}
            <div className="p-4 border-t border-border/50 bg-card">
              <div className="flex items-end gap-3">
                <div className="flex gap-1">
                  <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <Paperclip className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex-1 relative">
                  <textarea
                    value={nuevoMensaje}
                    onChange={(e) => setNuevoMensaje(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        enviarMensaje()
                      }
                    }}
                    placeholder="Escribe un mensaje..."
                    rows={1}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-32"
                  />
                  <button className="absolute right-3 bottom-3">
                    <Smile className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
                  </button>
                </div>
                <motion.button
                  onClick={enviarMensaje}
                  className="p-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={!nuevoMensaje.trim()}
                >
                  <Send className="h-5 w-5" />
                </motion.button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted/30">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Send className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Tus mensajes</h3>
              <p className="text-muted-foreground">
                Selecciona una conversación para comenzar a chatear
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
