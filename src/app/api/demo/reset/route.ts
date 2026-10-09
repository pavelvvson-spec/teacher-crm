import { NextResponse } from "next/server";
import { isDemoRequest, demoDbConfigured } from "@/lib/demo-mode";
import { getDemoPrisma } from "@/lib/prisma";
import { seedDemo } from "@/lib/demo-seed";

export const maxDuration = 60;

// Повернути демо-дані в початковий стан (працює лише в демо-режимі і лише з демо-базою)
export async function POST() {
  if (!(await isDemoRequest()) || !demoDbConfigured()) {
    return NextResponse.json({ error: "Доступно лише в демо-режимі" }, { status: 400 });
  }
  const result = await seedDemo(getDemoPrisma()!);
  return NextResponse.json({ ok: true, ...result });
}
