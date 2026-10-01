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