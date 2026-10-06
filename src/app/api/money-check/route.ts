import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateStudentBalance } from "@/lib/payments-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Finding = { level: "warn" | "info"; text: string };

function fmt(d: Date) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  }).format(d);
}

export async function GET() {
  const now = new Date();
  const nowMs = now.getTime();
  const DAY = 24 * 60 * 60 * 1000;

  const students = await prisma.student.findMany({
    where: { isActive: true },
    include: { lessons: true, payments: true },
    orderBy: { firstName: "asc" },
  });

  const result: { studentId: string; name: string; findings: Finding[] }[] = [];

  for (const s of students) {
    const findings: Finding[] = [];
    const cardPrice = s.defaultLessonPrice;
    const completed = s.lessons.filter((l) => l.status === "COMPLETED");

    // 1. Проведені уроки без ціни
    const zeroPrice = completed.filter((l) => l.price <= 0);
    if (zeroPrice.length > 0) {
      const first = Math.min(...zeroPrice.map((l) => l.startAt.getTime()));
      findings.push({
        level: "warn",
        text: `Проведені уроки без ціни (0 грн): ${zeroPrice.length} шт, перший ${fmt(new Date(first))}`,
      });
    }

    // 2. Ціна уроку відрізняється від картки учня
    if (cardPrice > 0) {
      const groups = new Map<number, { count: number; min: number; max: number }>();
      for (const l of completed) {
        if (l.price <= 0 || l.price === cardPrice) continue;
        const t = l.startAt.getTime();
        const g = groups.get(l.price);
        if (!g) groups.set(l.price, { count: 1, min: t, max: t });
        else {
          g.count++;
          g.min = Math.min(g.min, t);
          g.max = Math.max(g.max, t);
        }
      }
      for (const [price, g] of groups) {
        findings.push({
          level: "info",
          text: `Уроки за ціною ${price} грн (у картці ${cardPrice} грн): ${g.count} шт, з ${fmt(
            new Date(g.min)
          )} по ${fmt(new Date(g.max))}. Якщо це помилка, використай «Змінити ціну» в картці учня.`,
        });
      }
    }

    // 3. Минулі уроки без позначки
    const unmarked = s.lessons.filter(
      (l) =>
        (l.status === "SCHEDULED" || l.status === "RESCHEDULED") &&
        l.startAt.getTime() < nowMs - 12 * 60 * 60 * 1000
    );
    if (unmarked.length > 0) {
      const oldest = Math.min(...unmarked.map((l) => l.startAt.getTime()));
      findings.push({
        level: "warn",
        text: `Минулі уроки без позначки (не враховані в оплатах): ${unmarked.length} шт, найстаріший ${fmt(
          new Date(oldest)
        )}`,
      });
    }

    // 4. Підозрілі оплати
    const paid = s.payments.filter((p) => p.status === "PAID");
    const badAmount = paid.filter((p) => p.amount <= 0);
    if (badAmount.length > 0) {
      findings.push({
        level: "warn",
        text: `Оплати з нульовою або від'ємною сумою: ${badAmount.length} шт`,
      });
    }

    const future = paid.filter((p) => (p.paidAt ?? p.createdAt).getTime() > nowMs + DAY);
    if (future.length > 0) {
      findings.push({
        level: "warn",
        text: `Оплати з датою в майбутньому: ${future.length} шт, перша ${fmt(
          new Date(Math.min(...future.map((p) => (p.paidAt ?? p.createdAt).getTime())))
        )}`,
      });
    }

    const dupMap = new Map<string, number>();
    for (const p of paid) {
      if (p.amount <= 0) continue;
      const key = `${p.amount}|${fmt(p.paidAt ?? p.createdAt)}`;
      dupMap.set(key, (dupMap.get(key) ?? 0) + 1);
    }
    for (const [key, count] of dupMap) {
      if (count < 2) continue;
      const [amount, date] = key.split("|");
      findings.push({
        level: "info",
        text: `Схожі оплати: ${count} рази по ${amount} грн за ${date}. Перевір в «Історії оплат», чи це не дубль.`,
      });
    }

    // 5. Незвично великий борг або передоплата
    if (cardPrice > 0) {
      const balance = calculateStudentBalance(s.lessons, s.payments, s.paymentFrequency);
      if (balance >= cardPrice * 5) {
        findings.push({
          level: "info",
          text: `Борг ${balance} грн, це від 5 уроків. Перевір, чи всі оплати внесено.`,
        });
      }
      if (balance <= -cardPrice * 5 && s.paymentFrequency !== "MONTHLY_PREPAID") {
        findings.push({
          level: "info",
          text: `Передоплата ${Math.abs(balance)} грн, це від 5 уроків. Перевір, чи сума введена правильно.`,
        });
      }
    }

    if (findings.length > 0) {
      result.push({
        studentId: s.id,
        name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
        findings,
      });
    }
  }

  return NextResponse.json({ checkedStudents: students.length, students: result });
}