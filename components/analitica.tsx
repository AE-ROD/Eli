"use client"

import { Analytics } from "@vercel/analytics/next"
import { antesDeEnviarAnalitica } from "@/lib/analitica"

/**
 * `<Analytics />` con los tokens de los enlaces fuera de las URLs que manda
 * (`lib/analitica.ts`). Es componente cliente porque `beforeSend` es una
 * función, y el layout raíz, que es de servidor, no puede pasársela.
 */
export function Analitica() {
  return <Analytics beforeSend={antesDeEnviarAnalitica} />
}
