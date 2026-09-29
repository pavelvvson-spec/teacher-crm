import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
  await prisma.reminder.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.recurringSchedule.deleteMany({});
  await prisma.lesson.deleteMany({});
  await prisma.student.deleteMany({});

  return NextResponse.json({ success: true });
}