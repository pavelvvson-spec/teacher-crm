// Текст повідомлення з посиланням на урок і посилання за замовчуванням

export function lessonMeetingLink(meetingLink: string | null | undefined): string | null {
  return meetingLink || process.env.DEFAULT_MEETING_LINK || null;
}

export function kyivLessonDateTime(startAt: Date) {
  const now = new Date();
  const fmtDay = (d: Date) => d.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" });
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const time = startAt.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  });
  let day: string;
  if (fmtDay(startAt) === fmtDay(now)) day = "сьогодні";
  else if (fmtDay(startAt) === fmtDay(tomorrow)) day = "завтра";
  else
    day = startAt.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      weekday: "long",
      timeZone: "Europe/Kyiv",
    });
  return { day, time };
}

export function buildLinkMessage(firstName: string, startAt: Date, link: string): string {
  const { day, time } = kyivLessonDateTime(startAt);
  return `Привіт, ${firstName}! Урок англійської ${day} о ${time}.\nПосилання на Zoom: ${link}`;
}

// Номер для Viber: лише цифри, з кодом країни (українські 0XXXXXXXXX → 380XXXXXXXXX)
export function normalizeViberPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) digits = "38" + digits;
  if (digits.length < 10) return null;
  return digits;
}
