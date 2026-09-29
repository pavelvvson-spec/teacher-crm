import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
  await prisma.lesson.updateMany({ data: { paymentStatus: "UNPAID" } });
  await prisma.payment.deleteMany({});

  return NextResponse.json({ success: true });
}