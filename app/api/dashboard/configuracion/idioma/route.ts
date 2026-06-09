import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  locale: z.enum(["es", "en", "pt"]),
})

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { businessId?: string } | undefined
  if (!user?.businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 })
  }

  await prisma.business.update({
    where: { id: user.businessId },
    data: { preferredLocale: parsed.data.locale },
  })

  return NextResponse.json({ ok: true })
}
