import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const schedules = await prisma.recurringSchedule.findMany({
    where: { studentId: id, isActive: true },
    orderBy: { dayOfWeek: "asc" },
  });

  return NextResponse.json(schedules);
}