import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { paymentMethodLabel } from "@/lib/payments-utils";

export const dynamic = "force-dynamic";

const round = (n: number) => Math.round(n * 100) / 100;

type Entry = {
  key: string;
  date: string;
  kind: "lesson" | "payment";
  title: string;
  note: string;
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

  const entries: Entry[] = [];

  // Уроки: проведені, а також будь-які, позначені оплаченими
  for (const l of student.lessons) {
    const completed = l.status === "COMPLETED";
    if (!completed && l.paymentStatus !== "PAID") continue;

    let delta = 0;
    let cash = 0;
    let note = "";

    if (!completed) {
      cash = l.price;
      note = "урок не проведений, але позначений оплаченим";
    } else if (l.paymentStatus === "UNPAID") {
      delta = l.price;
      note = "не оплачено";
    } else if (l.paymentStatus === "DEBT") {
      delta = l.price;
      note = "борг";
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

    entries.push({
      key: `p-${p.id}`,
      date: when.toISOString(),
      kind: "payment",
      title: `Оплата ${p.amount} грн`,
      note: parts.join(" · "),
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