import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCalendarSafely } from "@/lib/google-calendar";

// Після змін синхронізуємо Google-календар (може зайняти кілька секунд)
export const maxDuration = 60;

export async function DELETE() {
  await prisma.reminder.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.recurringSchedule.deleteMany({});
  await prisma.lesson.deleteMany({});
  await prisma.student.deleteMany({});

  await syncCalendarSafely();
  return NextResponse.json({ success: true });
}