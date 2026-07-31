import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body?.firstName) {
    return NextResponse.json({ error: "Вкажіть ім'я учня" }, { status: 400 });
  }

  const student = await prisma.student.update({
    where: { id },
    data: {
      firstName: body.firstName,
      lastName: body.lastName || null,
      phone: body.phone || null,
      telegramUsername: body.telegramUsername || null,
      englishLevel: body.englishLevel,
      lessonFormat: body.lessonFormat,
      defaultLessonDuration: Number(body.defaultLessonDuration) || 60,
      defaultLessonPrice: Number(body.defaultLessonPrice) || 0,
      notes: body.notes || null,
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json(student);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.student.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}