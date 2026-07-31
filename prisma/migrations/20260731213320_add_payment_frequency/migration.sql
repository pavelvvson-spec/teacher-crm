-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('PER_LESSON', 'WEEKLY', 'MONTHLY', 'END_OF_WEEK', 'END_OF_MONTH');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "paymentFrequency" "PaymentFrequency";
