const KYIV_TZ = "Europe/Kyiv";

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Перетворює "стінний" час (те, що бачить вчителька на годиннику в Києві)
// на реальний момент часу в UTC. Потрібно, бо сервер рахує час не за Києвом.
export function kyivWallTimeToUtc(
  year: number,
  month: number, // 0-11
  day: number,
  hours: number,
  minutes: number
): Date {
  const utcGuess = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: KYIV_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(utcGuess);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const hour24 = Number(map.hour) === 24 ? 0 : Number(map.hour);

  const kyivAsUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour24,
    Number(map.minute),
    Number(map.second)
  );

  const offset = utcGuess.getTime() - kyivAsUtc;
  return new Date(utcGuess.getTime() + offset);
}

// Показує, котра година/хвилина і який день тижня за київським часом
// для будь-якого моменту часу, збереженого в базі (в UTC).
export function getKyivTimeParts(date: Date): {
  hours: number;
  minutes: number;
  dayOfWeek: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: KYIV_TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const hour24 = Number(map.hour) === 24 ? 0 : Number(map.hour);

  return {
    hours: hour24,
    minutes: Number(map.minute),
    dayOfWeek: WEEKDAY_MAP[map.weekday] ?? date.getDay(),
  };
}