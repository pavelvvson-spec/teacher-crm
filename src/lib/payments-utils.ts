export function calculateStudentBalance(lessons: {
  price: number;
  paymentStatus: string;
  status: string;
}[]): number {
  return lessons.reduce((total, lesson) => {
    if (lesson.status === "CANCELLED_BY_STUDENT" || lesson.status === "CANCELLED_BY_TEACHER") {
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