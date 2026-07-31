import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function GET() {
  const email = "aleksandratokarchuk@gmail.com";
  const password = "300482";
  const name = "Олександра";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ message: "Користувач вже існує" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: { email, passwordHash, name },
  });

  return NextResponse.json({ message: "Користувача створено успішно!" });
}