import { prisma } from "@/lib/prisma";

export async function getStudentNumber(studentId: string): Promise<number> {
  const students = await prisma.student.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return students.findIndex((s: { id: string }) => s.id === studentId) + 1;
}