export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // тиждень починається з понеділка
  return addDays(d, diff);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DAY_NAMES = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

export function formatDayLabel(date: Date): string {
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()}`;
}

export function formatMonthYear(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

export const LESSON_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Заплановано",
  COMPLETED: "Проведено",
  CANCELLED_BY_STUDENT: "Скасовано учнем",
  CANCELLED_BY_TEACHER: "Скасовано викладачем",
  RESCHEDULED: "Перенесено",
  NO_SHOW: "Учень не прийшов",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Не оплачено",
  PAID: "Оплачено",
  PARTIALLY_PAID: "Оплачено частково",
  DEBT: "Борг",
  PREPAID: "Передоплата",
};