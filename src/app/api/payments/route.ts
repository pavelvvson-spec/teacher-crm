import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/payments?studentId=...  — усі оплати учня
// GET /api/payments?lessonId=...   — оплати, внесені за конкретний урок
export async function GET(request: NextRequest) {
  const studentId = request.nextUrl.searchParams.get("studentId");
  const lessonId = request.nextUrl.searchParams.get("lessonId");

  if (!studentId && !lessonId) {
    return NextResponse.json({ error: "Вкажіть учня" }, { status: 400 });
  }

  const payments = await prisma.payment.findMany({
    where: {
      status: "PAID",
      ...(studentId ? { studentId } : {}),
      ...(lessonId ? { lessonId } : {}),
    },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(payments);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.studentId || !body?.amount) {
    return NextResponse.json({ error: "Вкажіть учня і суму" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Сума має бути більше нуля" }, { status: 400 });
  }

  // Захист від подвоєння: за один урок можна внести оплату лише один раз
  if (body.lessonId) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: body.lessonId },
      select: { paymentStatus: true },
    });
    if (lesson?.paymentStatus === "PAID") {
      return NextResponse.json(
        { error: "Цей урок уже позначений оплаченим. Спочатку зніми позначку." },
        { status: 409 }
      );
    }

    const existing = await prisma.payment.findFirst({
      where: { lessonId: body.lessonId, status: "PAID" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "За цей урок оплата вже внесена." },
        { status: 409 }
      );
    }
  }

  // Тепер оплата НЕ ставить на уроці позначку «оплачено».
  // Гроші записуються лише один раз — як окрема оплата з датою.
  const payment = await prisma.payment.create({
    data: {
      studentId: body.studentId,
      lessonId: body.lessonId || null,
      amount,
      status: "PAID",
      paymentMethod: body.paymentMethod || null,
      paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
      comment: body.comment || null,
    },
  });

  return NextResponse.json(payment, { status: 201 });
}