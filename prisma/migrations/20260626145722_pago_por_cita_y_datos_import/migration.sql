-- AlterTable
ALTER TABLE "cierres_turno" ADD COLUMN     "bankDepositVerified" BOOLEAN,
ADD COLUMN     "cashDenominations" JSONB,
ADD COLUMN     "cashExpenses" JSONB;

-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "paymentBreakdown" JSONB,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "tipAmount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "miembros_negocio" ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT;
