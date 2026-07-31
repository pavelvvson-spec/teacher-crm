import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

const SHORT_SESSION = 60 * 60 * 24 * 7; // 7 днів
const LONG_SESSION = 60 * 60 * 24 * 90; // 90 днів

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "Введіть email та пароль" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) {
    return NextResponse.json({ error: "Невірний email або пароль" }, { status: 401 });
  }

  const isValid = await verifyPassword(body.password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Невірний email або пароль" }, { status: 401 });
  }

  const maxAge = body.rememberMe ? LONG_SESSION : SHORT_SESSION;

  const token = await createSessionToken(user.id, maxAge);
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  });

  return response;
}