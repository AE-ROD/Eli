import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getStripe, PLANS, type PlanKey } from "@/lib/stripe"
import { z } from "zod"

const schema = z.object({
  plan: z.enum(["pro", "team"]),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId || !session.user.email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const body = await request.json()
  const { plan } = schema.parse(body)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? request.nextUrl.origin
  const planConfig = PLANS[plan as PlanKey]

  if (!planConfig.priceId) {
    return NextResponse.json({ error: "Plan no configurado" }, { status: 500 })
  }

  const negocio = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { stripeCustomerId: true, name: true },
  })

  const stripe = getStripe()

  // Reuse or create customer
  let customerId = negocio?.stripeCustomerId ?? undefined
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: negocio?.name,
      metadata: { businessId: session.user.businessId },
    })
    customerId = customer.id
    await prisma.business.update({
      where: { id: session.user.businessId },
      data: { stripeCustomerId: customerId },
    })
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: planConfig.priceId, quantity: 1 }],
    success_url: `${baseUrl}/dashboard?upgrade=success`,
    cancel_url: `${baseUrl}/dashboard/upgrade`,
    metadata: { businessId: session.user.businessId, plan },
    subscription_data: {
      metadata: { businessId: session.user.businessId, plan },
    },
  })

  return NextResponse.json({ url: checkoutSession.url })
}
