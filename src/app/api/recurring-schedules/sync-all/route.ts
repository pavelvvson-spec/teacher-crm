import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncStudentLessons } from "@/lib/recurring-schedule-sync";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  // Без явного dryRun: false лише показуємо, що буде змінено
  const dryRun = body?.dryRun !== false;
  const excludeLessonIds: string[] = Array.isArray(body?.excludeLessonIds)
    ? body.excludeLessonIds
    : [];

  const students = await prisma.student.findMany({
    where: { isActive: true, recurringSchedules: { some: { isActive: true } } },
    orderBy: { firstName: "asc" },
  });

  const report: {
    studentId: string;
    name: string;
    created: number;
    removedGray: number;
    cancelled: { id: string; startAt: Date; hasPrep: boolean }[];
  }[] = [];

  for (const student of students) {
    const result = await syncStudentLessons(student.id, new Date(), { dryRun, excludeLessonIds });
    if (
      result.lessonsCreated > 0 ||
      result.cancelledLessons.length > 0 ||
      result.grayRemoved > 0
    ) {
      report.push({
        studentId: student.id,
        name: `${student.firstName} ${student.lastName ?? ""}`.trim(),
        created: result.lessonsCreated,
        removedGray: result.grayRemoved,
        cancelled: result.cancelledLessons,
      });
    }
  }

  return NextResponse.json({ dryRun, students: report });
}
