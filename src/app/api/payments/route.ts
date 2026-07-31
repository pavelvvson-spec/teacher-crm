import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.studentId || !body?.amount) {
    return NextResponse.json({ error: "Вкажіть учня і суму" }, { status: 400 });
  }

  const payment = await prisma.payment.create({
    data: {
      studentId: body.studentId,
      lessonId: body.lessonId || null,
      amount: Number(body.amount),
      status: "PAID",
      paymentMethod: body.paymentMethod || null,
      paidAt: new Date(),
      comment: body.comment || null,
    },
  });

  if (body.lessonId) {
    await prisma.lesson.update({
      where: { id: body.lessonId },
      data: { paymentStatus: "PAID" },
    });
  }

  return NextResponse.json(payment, { status: 201 });
}