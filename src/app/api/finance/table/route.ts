import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kyivWallTimeToUtc } from "@/lib/kyiv-time";

export const dynamic = "force-dynamic";

// Межі місяця за київським часом (month: 0-11)
function monthRange(year: number, month: number) {
  return { from: kyivWallTimeToUtc(year, month, 1, 0, 0), to: kyivWallTimeToUtc(year, month + 1, 1, 0, 0) };
}

// Київський місяць (0-11) і рік для дати
function kyivYm(d: Date): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit" }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return { y: Number(map.year), m: Number(map.month) - 1 };
}

// Таблиця фінансів: ?mode=month&year=2026&month=9  або  ?mode=year&year=2026
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const mode = sp.get("mode") === "year" ? "year" : "month";
  const now = kyivYm(new Date());
  const year = Number(sp.get("year")) || now.y;
  const month = sp.get("month") !== null ? Math.min(11, Math.max(0, Number(sp.get("month")))) : now.m;

  const { from, to } = mode === "year" ? { from: monthRange(year, 0).from, to: monthRange(year + 1, 0).from } : monthRange(year, month);

  const students = await prisma.student.findMany({
    select: { id: true, firstName: true, lastName: true, defaultLessonPrice: true, isActive: true },
    orderBy: { firstName: "asc" },
  });

  // Отримано: окремі оплати (за датою оплати) + старі позначки «оплачено» на уроках (за датою уроку)
  const payments = await prisma.payment.findMany({
    where: {
      status: "PAID",
      OR: [{ paidAt: { gte: from, lt: to } }, { paidAt: null, createdAt: { gte: from, lt: to } }],
    },
    select: { studentId: true, amount: true, paidAt: true, createdAt: true },
  });
  const flagged = await prisma.lesson.findMany({
    where: { startAt: { gte: from, lt: to }, paymentStatus: "PAID" },
    select: { studentId: true, price: true, startAt: true },
  });
  // Зароблено: проведені уроки (ціна)
  const completed = await prisma.lesson.findMany({
    where: { startAt: { gte: from, lt: to }, status: "COMPLETED" },
    select: { studentId: true, price: true, startAt: true },
  });

  if (mode === "month") {
    const acc = new Map<string, { lessons: number; earned: number; received: number }>();
    const get = (id: string) => {
      let v = acc.get(id);
      if (!v) acc.set(id, (v = { lessons: 0, earned: 0, received: 0 }));
      return v;
    };
    for (const p of payments) get(p.studentId).received += p.amount;
    for (const l of flagged) get(l.studentId).received += l.price;
    for (const l of completed) {
      const v = get(l.studentId);
      v.lessons += 1;
      v.earned += l.price;
    }
    const rows = students
      .map((s) => {
        const v = acc.get(s.id) ?? { lessons: 0, earned: 0, received: 0 };
        return {
          id: s.id,
          name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
          price: s.defaultLessonPrice,
          isActive: s.isActive,
          ...v,
        };
      })
      // активні — завжди; неактивні — лише якщо щось було в цьому місяці
      .filter((r) => r.isActive || r.lessons > 0 || r.received > 0);
    return NextResponse.json({ mode, year, month, rows });
  }

  // Рік: отримано по місяцях
  const acc = new Map<string, number[]>();
  const add = (id: string, d: Date, amount: number) => {
    const { m } = kyivYm(d);
    let arr = acc.get(id);
    if (!arr) acc.set(id, (arr = Array(12).fill(0)));
    arr[m] += amount;
  };
  for (const p of payments) add(p.studentId, p.paidAt ?? p.createdAt, p.amount);
  for (const l of flagged) add(l.studentId, l.startAt, l.price);
  const rows = students
    .map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
      price: s.defaultLessonPrice,
      isActive: s.isActive,
      months: acc.get(s.id) ?? Array(12).fill(0),
    }))
    .filter((r) => r.isActive || r.months.some((x: number) => x > 0));
  return NextResponse.json({ mode, year, rows });
}
