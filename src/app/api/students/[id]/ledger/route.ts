import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { paymentMethodLabel, allocatePayments } from "@/lib/payments-utils";

export const dynamic = "force-dynamic";

const round = (n: number) => Math.round(n * 100) / 100;

function fmtShort(d: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

type Entry = {
  key: string;
  date: string;
  kind: "lesson" | "payment";
  title: string;
  note: string;
  coverage: string;
  delta: number;
  cash: number;
  balanceAfter: number;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const student = await prisma.student.findUnique({
    where: { id },
    include: { lessons: true, payments: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  const alloc = allocatePayments(student.lessons, student.payments);
  const lessonById = new Map(student.lessons.map((l) => [l.id, l]));
  const paymentById = new Map(student.payments.map((p) => [p.id, p]));

  const entries: Entry[] = [];

  // Уроки: проведені, а також будь-які, позначені оплаченими
  for (const l of student.lessons) {
    const completed = l.status === "COMPLETED";
    if (!completed && l.paymentStatus !== "PAID") continue;

    let delta = 0;
    let cash = 0;
    let note = "";
    let coverage = "";

    if (!completed) {
      cash = l.price;
      note = "урок не проведений, але позначений оплаченим";
    } else if (l.paymentStatus === "UNPAID" || l.paymentStatus === "DEBT") {
      delta = l.price;
      note = l.paymentStatus === "DEBT" ? "борг" : "не оплачено";

      const parts = alloc.lessonParts[l.id] ?? [];
      const covered = parts.reduce((a, p) => a + p.amount, 0);
      const partsText = parts
        .map((p) => {
          const pay = paymentById.get(p.paymentId);
          const when = pay ? fmtShort(pay.paidAt ?? pay.createdAt) : "?";
          return `оплата ${when} (${round(p.amount)} грн)`;
        })
        .join(", ");

      if (covered >= l.price - 0.005) {
        coverage = `покрито: ${partsText}`;
      } else if (covered > 0) {
        coverage = `покрито частково ${round(covered)} з ${l.price} грн: ${partsText}`;
      } else {
        coverage = "поки не покрито жодною оплатою";
      }
    } else if (l.paymentStatus === "PREPAID") {
      delta = -l.price;
      note = "позначено як передоплачений (зменшує баланс)";
    } else if (l.paymentStatus === "PAID") {
      cash = l.price;
      note = "позначено оплаченим (у баланс не входить)";
    } else {
      note = "частково оплачено (у баланс не входить)";
    }

    entries.push({
      key: `l-${l.id}`,
      date: l.startAt.toISOString(),
      kind: "lesson",
      title: `Урок ${l.price} грн`,
      note,
      coverage,
      delta,
      cash,
      balanceAfter: 0,
    });
  }

  // Окремі оплати
  for (const p of student.payments) {
    if (p.status !== "PAID") continue;
    const when = p.paidAt ?? p.createdAt;
    const parts: string[] = ["окрема оплата"];
    if (p.paymentMethod) parts.push(paymentMethodLabel(p.paymentMethod));
    if (p.comment) parts.push(p.comment);

    const covers = alloc.paymentParts[p.id] ?? [];
    const left = alloc.paymentLeft[p.id] ?? 0;
    const coverParts: string[] = [];
    if (covers.length > 0) {
      const text = covers
        .map((c) => {
          const lesson = lessonById.get(c.lessonId);
          const day = lesson ? fmtShort(lesson.startAt) : "?";
          return `урок ${day} (${round(c.amount)} грн)`;
        })
        .join(", ");
      coverParts.push(`покрила: ${text}`);
    }
    if (left > 0) {
      coverParts.push(`залишок ${left} грн (передоплата)`);
    }

    entries.push({
      key: `p-${p.id}`,
      date: when.toISOString(),
      kind: "payment",
      title: `Оплата ${p.amount} грн`,
      note: parts.join(" · "),
      coverage: coverParts.join("; "),
      delta: -p.amount,
      cash: p.amount,
      balanceAfter: 0,
    });
  }

  entries.sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (diff !== 0) return diff;
    return a.kind === b.kind ? 0 : a.kind === "lesson" ? -1 : 1;
  });

  let balance = 0;
  let cashByLessonFlags = 0;
  let cashByPayments = 0;
  for (const e of entries) {
    balance += e.delta;
    e.balanceAfter = round(balance);
    if (e.kind === "lesson") cashByLessonFlags += e.cash;
    else cashByPayments += e.cash;
  }

  return NextResponse.json({
    name: `${student.firstName} ${student.lastName ?? ""}`.trim(),
    entries,
    finalBalance: round(balance),
    cashByLessonFlags: round(cashByLessonFlags),
    cashByPayments: round(cashByPayments),
  });
}