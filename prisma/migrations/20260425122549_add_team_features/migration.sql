-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "memberId" TEXT;

-- AlterTable
ALTER TABLE "horarios_laborales" ADD COLUMN     "memberId" TEXT;

-- AlterTable
ALTER TABLE "negocios" ADD COLUMN     "teamSize" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "miembros_negocio" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'worker',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miembros_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitaciones" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'worker',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "miembros_negocio_businessId_idx" ON "miembros_negocio"("businessId");

-- CreateIndex
CREATE INDEX "miembros_negocio_userId_idx" ON "miembros_negocio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "miembros_negocio_businessId_userId_key" ON "miembros_negocio"("businessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitaciones_token_key" ON "invitaciones"("token");

-- CreateIndex
CREATE INDEX "invitaciones_businessId_idx" ON "invitaciones"("businessId");

-- CreateIndex
CREATE INDEX "citas_memberId_idx" ON "citas"("memberId");

-- CreateIndex
CREATE INDEX "horarios_laborales_memberId_idx" ON "horarios_laborales"("memberId");

-- AddForeignKey
ALTER TABLE "miembros_negocio" ADD CONSTRAINT "miembros_negocio_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miembros_negocio" ADD CONSTRAINT "miembros_negocio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_laborales" ADD CONSTRAINT "horarios_laborales_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "miembros_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "miembros_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
