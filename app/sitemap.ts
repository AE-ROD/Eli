import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://useeli.com"

  const negocios = await prisma.business.findMany({
    select: { slug: true, updatedAt: true },
  })

  const bookingPages: MetadataRoute.Sitemap = negocios.map((n) => ({
    url: `${baseUrl}/reservar/${n.slug}`,
    lastModified: n.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }))

  const profilePages: MetadataRoute.Sitemap = negocios.map((n) => ({
    url: `${baseUrl}/perfil/${n.slug}`,
    lastModified: n.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }))

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...bookingPages,
    ...profilePages,
  ]
}
