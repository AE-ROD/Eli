"use client"

import Link from "next/link"
import { EliLogo } from "@/components/shared/eli-logo"

const footerLinks = {
  producto: [
    { label: "Características", href: "#por-que-eli" },
    { label: "Cómo funciona", href: "#como-funciona" },
    { label: "Precios", href: "#precios" },
  ],
  empresa: [
    { label: "Contacto", href: "#contacto" },
  ],
}

export function Footer() {
  return (
    <footer className="bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main Footer */}
        <div className="py-16 grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <EliLogo size="md" inverted />
            <p className="mt-4 text-sm text-background/70 max-w-xs">
              Simplificamos tu agenda para que tú te enfoques en tu talento.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-semibold text-background mb-4">Producto</h4>
            <ul className="space-y-3">
              {footerLinks.producto.map((link) => (
                <li key={link.label}>
                  <Link 
                    href={link.href}
                    className="text-sm text-background/70 hover:text-background transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="font-semibold text-background mb-4">Empresa</h4>
            <ul className="space-y-3">
              {footerLinks.empresa.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-background/70 hover:text-background transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-6 border-t border-background/10 flex justify-center">
          <p className="text-sm text-background/60">
            © {new Date().getFullYear()} Eli. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
