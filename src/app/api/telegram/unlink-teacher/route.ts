import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Відключає чат вчительки (доступно лише після входу в CRM — шлях не публічний)
export async function POST(request: NextRequest) {
  const settings = await prisma.settings.findFirst();
  if (settings) {
    await prisma.settings.update({
      where: { id: settings.id },
      data: { teacherTelegramChatId: null },
    });
  }
  return NextResponse.redirect(new URL("/settings/telegram", request.url), 303);
}
