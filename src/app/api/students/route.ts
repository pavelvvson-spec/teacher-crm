import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.firstName) {
    return NextResponse.json({ error: "Вкажіть ім'я учня" }, { status: 400 });
  }

  const student = await prisma.student.create({
    data: {
      firstName: body.firstName,
      lastName: body.lastName || null,
      phone: body.phone || null,
      telegramUsername: body.telegramUsername || null,
      englishLevel: body.englishLevel,
      lessonFormat: body.lessonFormat,
      defaultLessonDuration: Number(body.defaultLessonDuration) || 60,
      defaultLessonPrice: Number(body.defaultLessonPrice) || 0,
      paymentFrequency: body.paymentFrequency || null,
      notes: body.notes || null,
    },
  });

  return NextResponse.json(student, { status: 201 });
}