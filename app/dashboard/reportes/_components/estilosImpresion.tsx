// Estilos @media print inyectados localmente (sin tocar app/globals.css, fuera de mi alcance).
// Oculta todo lo que tenga data-no-print (sidebar, header, botones de acción) y deja
// visible solo el contenido marcado con data-print-area.
export function EstilosImpresion() {
  return (
    <style jsx global>{`
      @media print {
        [data-no-print] {
          display: none !important;
        }
        [data-print-area] {
          display: block !important;
        }
        body {
          background: white !important;
        }
        .min-h-screen {
          min-height: 0 !important;
        }
      }
    `}</style>
  )
}
