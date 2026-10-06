import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateStudentBalance } from "@/lib/payments-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const round = (n: number) => Math.round(n * 100) / 100;

export async function GET() {
  const students = await prisma.student.findMany({
    where: { isActive: true },
    include: { lessons: true, payments: true },
    orderBy: { firstName: "asc" },
  });

  const rows = students.map((s) => {
    const completed = s.lessons.filter((l) => l.status === "COMPLETED");
    const sumByStatus = (status: string) =>
      completed.filter((l) => l.paymentStatus === status).reduce((a, l) => a + l.price, 0);

    const earned = completed.reduce((a, l) => a + l.price, 0);
    const paidFlag = sumByStatus("PAID");
    const prepaidFlag = sumByStatus("PREPAID");
    const partialFlag = sumByStatus("PARTIALLY_PAID");
    const unpaidFlag = sumByStatus("UNPAID") + sumByStatus("DEBT");

    const paidPayments = s.payments.filter((p) => p.status === "PAID");
    const paymentsTotal = paidPayments.reduce((a, p) => a + p.amount, 0);

    // Оплати, прив'язані до конкретного уроку
    const linkedLessonIds = new Set(
      paidPayments.filter((p) => p.lessonId).map((p) => p.lessonId as string)
    );
    const linkedPaymentsTotal = paidPayments
      .filter((p) => p.lessonId)
      .reduce((a, p) => a + p.amount, 0);

    // Уроки з позначкою "оплачено", за які немає окремої оплати
    const paidFlagWithoutPayment = completed
      .filter((l) => l.paymentStatus === "PAID" && !linkedLessonIds.has(l.id))
      .reduce((a, l) => a + l.price, 0);

    // Уроки з позначкою "оплачено" і водночас з окремою оплатою (можливе подвоєння)
    const doubleCounted = completed
      .filter((l) => l.paymentStatus === "PAID" && linkedLessonIds.has(l.id))
      .reduce((a, l) => a + l.price, 0);

    const paidNotCompleted = s.lessons.filter(
      (l) => l.status !== "COMPLETED" && l.paymentStatus === "PAID"
    );

    const oldBalance = calculateStudentBalance(s.lessons, s.payments, s.paymentFrequency);
    const newBalance = earned - paidFlagWithoutPayment - paymentsTotal;

    return {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
      paymentFrequency: s.paymentFrequency,
      oldBalance: round(oldBalance),
      newBalance: round(newBalance),
      diff: round(newBalance - oldBalance),
      earned: round(earned),
      paidFlag: round(paidFlag),
      prepaidFlag: round(prepaidFlag),
      partialFlag: round(partialFlag),
      unpaidFlag: round(unpaidFlag),
      paymentsTotal: round(paymentsTotal),
      linkedPaymentsTotal: round(linkedPaymentsTotal),
      doubleCounted: round(doubleCounted),
      paidNotCompletedCount: paidNotCompleted.length,
      paidNotCompletedSum: round(paidNotCompleted.reduce((a, l) => a + l.price, 0)),
    };
  });

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.name.localeCompare(b.name));

  return NextResponse.json({ rows });
}