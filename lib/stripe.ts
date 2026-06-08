import Stripe from "stripe"

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error("STRIPE_SECRET_KEY not set")
    _stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" })
  }
  return _stripe
}

export const PLANS = {
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRICE_PRO ?? "",
    price: 19,
    workers: 5,
    features: ["5 trabajadores", "ES/EN/PT-BR", "WhatsApp", "Analítica", "Perfil SEO"],
  },
  team: {
    name: "Team",
    priceId: process.env.STRIPE_PRICE_TEAM ?? "",
    price: 49,
    workers: -1,
    features: ["Trabajadores ilimitados", "Todo Pro", "Soporte prioritario", "Export de datos"],
  },
} as const

export type PlanKey = keyof typeof PLANS
