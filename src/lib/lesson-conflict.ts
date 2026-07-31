import { prisma } from "@/lib/prisma";

type LessonStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED_BY_STUDENT"
  | "CANCELLED_BY_TEACHER"
  | "RESCHEDULED"
  | "NO_SHOW";

const ACTIVE_STATUSES: LessonStatus[] = ["SCHEDULED", "RESCHEDULED", "COMPLETED"];

export async function findConflictingLesson(
  startAt: Date,
  endAt: Date,
  excludeLessonId?: string,
  excludeStudentId?: string
) {
  return prisma.lesson.findFirst({
    where: {
      id: excludeLessonId ? { not: excludeLessonId } : undefined,
      studentId: excludeStudentId ? { not: excludeStudentId } : undefined,
      status: { in: ACTIVE_STATUSES },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    include: { student: true },
  });
}

export async function findExactDuplicateLesson(
  studentId: string,
  startAt: Date,
  excludeLessonId?: string
) {
  return prisma.lesson.findFirst({
    where: {
      id: excludeLessonId ? { not: excludeLessonId } : undefined,
      studentId,
      startAt,
      status: { in: ACTIVE_STATUSES },
    },
  });
}