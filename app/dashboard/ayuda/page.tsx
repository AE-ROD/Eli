import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { HelpCircle, Mail, MessageCircle } from "lucide-react"
import Link from "next/link"

const FAQS = [
  {
    pregunta: "¿Cómo creo mi primera cita?",
    respuesta: "Ve a Calendario → haz clic en 'Nueva cita' → selecciona un usuario, servicio, fecha y hora. También puedes crear walk-ins desde la sección Walk-in.",
  },
  {
    pregunta: "¿Cómo comparto mi enlace de reservas con clientes?",
    respuesta: "En el Dashboard encontrarás tu enlace de reservas personalizado. Cópialo y compártelo por WhatsApp, Instagram o correo electrónico.",
  },
  {
    pregunta: "¿Puedo cancelar mi suscripción en cualquier momento?",
    respuesta: "Sí. Puedes cancelar desde la sección 'Actualizar plan'. Tu cuenta vuelve al plan gratuito al terminar el periodo pagado.",
  },
  {
    pregunta: "¿Los clientes reciben recordatorio automático?",
    respuesta: "Sí. En el plan Pro y Team, los clientes reciben un email de confirmación al reservar y un recordatorio 24 horas antes por email y WhatsApp.",
  },
  {
    pregunta: "¿Qué pasa si el cliente no aparece (no-show)?",
    respuesta: "Puedes marcar la cita como 'No-show' desde el panel de detalle de la cita en el Calendario. Esto queda registrado en el historial del cliente.",
  },
  {
    pregunta: "¿Puedo tener más de un trabajador?",
    respuesta: "El plan Free incluye 1 trabajador. El plan Pro permite hasta 5 y el Team trabajadores ilimitados. Ve a 'Equipo' para invitar a miembros.",
  },
  {
    pregunta: "¿Funcionan las reservas desde el teléfono del cliente?",
    respuesta: "Sí. La página de reservas es completamente responsive y funciona en cualquier dispositivo.",
  },
  {
    pregunta: "¿Puedo cambiar el idioma del sistema de reservas?",
    respuesta: "Sí. Ve a Configuración → Idioma preferido. Puedes elegir Español, English o Português. El plan Pro y Team soportan los 3 idiomas.",
  },
]

export default function AyudaPage() {
  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Ayuda"
        subtitulo="Preguntas frecuentes y soporte"
        mostrarBusqueda={false}
      />

      <div className="p-6 max-w-3xl">
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <HelpCircle className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Preguntas frecuentes</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <details
                key={i}
                className="bg-card border border-border/50 rounded-xl group"
              >
                <summary className="flex items-center justify-between p-4 cursor-pointer list-none font-medium text-sm text-foreground hover:text-primary transition-colors">
                  {faq.pregunta}
                  <span className="text-muted-foreground group-open:rotate-45 transition-transform duration-200 text-lg leading-none ml-4 flex-shrink-0">+</span>
                </summary>
                <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                  {faq.respuesta}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">¿No encontraste tu respuesta?</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <a
              href="mailto:hola@useeli.com"
              className="flex items-start gap-4 p-5 bg-card border border-border/50 rounded-xl hover:border-primary/30 hover:bg-primary/5 transition-all"
            >
              <div className="p-2.5 rounded-xl bg-blue-100 flex-shrink-0">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">Email de soporte</p>
                <p className="text-xs text-muted-foreground mt-0.5">hola@useeli.com</p>
                <p className="text-xs text-muted-foreground">Respuesta en menos de 24h</p>
              </div>
            </a>
            <Link
              href="/#contacto"
              className="flex items-start gap-4 p-5 bg-card border border-border/50 rounded-xl hover:border-primary/30 hover:bg-primary/5 transition-all"
            >
              <div className="p-2.5 rounded-xl bg-violet-100 flex-shrink-0">
                <MessageCircle className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">Formulario de contacto</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cuéntanos tu caso</p>
                <p className="text-xs text-muted-foreground">En la página principal</p>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
