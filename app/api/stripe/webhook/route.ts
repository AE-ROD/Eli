import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe"
import type Stripe from "stripe"

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const getBusinessId = (obj: { metadata?: Stripe.Metadata | null }): string | null =>
    obj.metadata?.businessId ?? null

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription
      const businessId = getBusinessId(sub)
      if (!businessId) break
      const plan = (sub.metadata?.plan as string) ?? "pro"
      await prisma.business.update({
        where: { id: businessId },
        data: { plan: sub.status === "active" ? plan : "free" },
      })
      break
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      const businessId = getBusinessId(sub)
      if (!businessId) break
      await prisma.business.update({
        where: { id: businessId },
        data: { plan: "free" },
      })
      break
    }
    default:
      // Unhandled event type — acknowledge receipt
      break
  }

  return NextResponse.json({ received: true })
}
