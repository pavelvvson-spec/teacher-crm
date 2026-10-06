export function calculateStudentBalance(
  lessons: {
    price: number;
    paymentStatus: string;
    status: string;
  }[],
  payments: { amount: number; status: string }[] = [],
  paymentFrequency: string | null = null
): number {
  // paymentFrequency наразі не впливає на те, що саме потрапляє в борг —
  // борг завжди рахується тільки за реально проведені уроки.
  // Параметр лишили про всяк випадок на майбутнє.
  void paymentFrequency;

  const lessonsBalance = lessons.reduce((total, lesson) => {
    if (lesson.status !== "COMPLETED") {
      return total;
    }
    if (lesson.paymentStatus === "UNPAID" || lesson.paymentStatus === "DEBT") {
      return total + lesson.price;
    }
    if (lesson.paymentStatus === "PREPAID") {
      return total - lesson.price;
    }
    return total;
  }, 0);

  const paymentsTotal = payments.reduce((total, p) => {
    if (p.status === "PAID") return total + p.amount;
    return total;
  }, 0);

  return lessonsBalance - paymentsTotal;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Готівка",
  CARD: "Банківська картка",
  TRANSFER: "Переказ",
  OTHER: "Інше",
};

export function paymentMethodLabel(method: string | null): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

type AllocLesson = {
  id: string;
  startAt: Date;
  price: number;
  paymentStatus: string;
  status: string;
};

type AllocPayment = {
  id: string;
  paidAt: Date | null;
  createdAt: Date;
  amount: number;
  status: string;
};

export type PaymentAllocation = {
  // Які оплати і якою сумою закрили цей урок
  lessonParts: Record<string, { paymentId: string; amount: number }[]>;
  // Які уроки і якою сумою закрила ця оплата
  paymentParts: Record<string, { lessonId: string; amount: number }[]>;
  // Скільки з цієї оплати лишилось (передоплата)
  paymentLeft: Record<string, number>;
};

// Лише для показу: кожна оплата спершу закриває найстаріші неоплачені уроки.
// На баланс і формули це не впливає.
export function allocatePayments(
  lessons: AllocLesson[],
  payments: AllocPayment[]
): PaymentAllocation {
  const EPS = 0.005;

  const due = lessons
    .filter(
      (l) =>
        l.status === "COMPLETED" &&
        (l.paymentStatus === "UNPAID" || l.paymentStatus === "DEBT")
    )
    .map((l) => ({ id: l.id, startAt: l.startAt, remaining: l.price }))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const pays = payments
    .filter((p) => p.status === "PAID" && p.amount > 0)
    .sort(
      (a, b) =>
        (a.paidAt ?? a.createdAt).getTime() - (b.paidAt ?? b.createdAt).getTime()
    );

  const result: PaymentAllocation = {
    lessonParts: {},
    paymentParts: {},
    paymentLeft: {},
  };

  let i = 0;
  for (const p of pays) {
    let left = p.amount;
    result.paymentParts[p.id] = [];

    while (left > EPS && i < due.length) {
      const lesson = due[i];
      const take = Math.min(left, lesson.remaining);

      if (!result.lessonParts[lesson.id]) result.lessonParts[lesson.id] = [];
      result.lessonParts[lesson.id].push({ paymentId: p.id, amount: take });
      result.paymentParts[p.id].push({ lessonId: lesson.id, amount: take });

      lesson.remaining -= take;
      left -= take;
      if (lesson.remaining <= EPS) i++;
    }

    result.paymentLeft[p.id] = Math.round(left * 100) / 100;
  }

  return result;
}