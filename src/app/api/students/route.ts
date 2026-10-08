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
      contactChannel: body.contactChannel === "VIBER" ? "VIBER" : "TELEGRAM",
      viberPhone: body.viberPhone || null,
      birthYear: Number(body.birthYear) >= 1920 && Number(body.birthYear) <= new Date().getFullYear() ? Number(body.birthYear) : null,
      isAdult: Boolean(body.isAdult),
      birthDay: Number(body.birthDay) >= 1 && Number(body.birthDay) <= 31 ? Number(body.birthDay) : null,
      birthMonth: Number(body.birthMonth) >= 1 && Number(body.birthMonth) <= 12 ? Number(body.birthMonth) : null,
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