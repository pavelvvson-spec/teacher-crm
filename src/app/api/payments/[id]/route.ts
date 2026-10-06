import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const amount = Number(body?.amount);
  if (!body || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Вкажіть коректну суму" }, { status: 400 });
  }

  const payment = await prisma.payment.update({
    where: { id },
    data: {
      amount,
      paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
    },
  });

  return NextResponse.json(payment);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) {
    return NextResponse.json({ error: "Оплату не знайдено" }, { status: 404 });
  }

  await prisma.payment.delete({ where: { id } });

  if (payment.lessonId) {
    await prisma.lesson.update({
      where: { id: payment.lessonId },
      data: { paymentStatus: "UNPAID" },
    });
  }

  return NextResponse.json({ ok: true });
}