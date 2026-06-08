-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "negocios" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Cancun',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_businessId_email_key" ON "clientes"("businessId", "email");
