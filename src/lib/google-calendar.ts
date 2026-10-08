// Синхронізація уроків CRM → Google-календар Саші (щоб Fireflies сам заходив на уроки).
//
// Доступ: службовий акаунт Google (змінна GOOGLE_SERVICE_ACCOUNT_JSON у Vercel — весь вміст
// JSON-ключа). Саша відкриває йому доступ до свого календаря («Вносити зміни в події»).
// GOOGLE_CALENDAR_ID — адреса календаря (зазвичай її Gmail).
// DEFAULT_MEETING_LINK — постійне посилання Zoom, якщо в уроці посилання не вказано.
//
// Принцип: «звірка». Беремо майбутні уроки з CRM і події CRM у календарі та приводимо календар
// у відповідність: додаємо відсутні, оновлюємо змінені, видаляємо зайві. Події CRM мають
// передбачуваний id (з id уроку), тому дублікатів не буде навіть при одночасних запусках.

import { SignJWT, importPKCS8 } from "jose";
import { prisma } from "@/lib/prisma";

const CAL_API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const DAYS_AHEAD = 35;
const MARKER_KEY = "crm";
const MARKER_VALUE = "teacher-crm";

type ServiceAccount = { client_email: string; private_key: string };

function readServiceAccount(): ServiceAccount | null {
  // Варіант 2: дві окремі змінні (email і private_key), якщо весь JSON не вставляється
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const keyRaw = process.env.GOOGLE_PRIVATE_KEY?.trim();
  if (email && keyRaw) {
    const key = keyRaw.replace(/^"+|"+,?$/g, "").replace(/\\n/g, "\n");
    return { client_email: email, private_key: key };
  }

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

export function isCalendarConfigured(): boolean {
  return Boolean(readServiceAccount() && process.env.GOOGLE_CALENDAR_ID);
}

export function serviceAccountEmail(): string | null {
  return readServiceAccount()?.client_email ?? null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const sa = readServiceAccount();
  if (!sa) throw new Error("Не налаштовано GOOGLE_SERVICE_ACCOUNT_JSON");

  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google не видав доступ: ${data.error_description || data.error || res.status}`);
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function gcal(method: string, path: string, body?: unknown) {
  const token = await getAccessToken();
  const res = await fetch(`${CAL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, json: json as Record<string, unknown> | null };
}

// id події в Google: дозволені символи 0-9 і a-v, тому кодуємо id уроку в hex
function eventIdForLesson(lessonId: string): string {
  return "crm" + Buffer.from(lessonId, "utf8").toString("hex");
}

type DesiredEvent = {
  id: string;
  summary: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
  lessonId: string;
};

function eventBody(e: DesiredEvent) {
  return {
    id: e.id,
    summary: e.summary,
    location: e.location,
    description: e.description,
    start: { dateTime: e.start.toISOString(), timeZone: "Europe/Kyiv" },
    end: { dateTime: e.end.toISOString(), timeZone: "Europe/Kyiv" },
    status: "confirmed",
    extendedProperties: { private: { [MARKER_KEY]: MARKER_VALUE, crmLessonId: e.lessonId } },
  };
}

export type ReconcileResult = { created: number; updated: number; deleted: number; skippedNoLink: number };

export async function reconcileCalendar(): Promise<ReconcileResult> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId || !readServiceAccount()) {
    throw new Error("Google-календар не налаштовано");
  }
  const cal = encodeURIComponent(calendarId);
  const now = new Date();
  const until = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const defaultLink = process.env.DEFAULT_MEETING_LINK || "";

  // 1) Які події мають бути
  const lessons = await prisma.lesson.findMany({
    where: {
      endAt: { gt: now },
      startAt: { lt: until },
      status: { in: ["SCHEDULED", "RESCHEDULED", "COMPLETED"] },
      student: { isActive: true },
    },
    include: { student: { select: { firstName: true, lastName: true } } },
  });

  const desired = new Map<string, DesiredEvent>();
  let skippedNoLink = 0;
  for (const l of lessons) {
    const link = l.meetingLink || defaultLink;
    if (!link) {
      skippedNoLink++;
      continue;
    }
    const name = `${l.student.firstName} ${l.student.lastName ?? ""}`.trim();
    const id = eventIdForLesson(l.id);
    desired.set(id, {
      id,
      lessonId: l.id,
      summary: `Англійська: ${name}`,
      location: link,
      description: `Урок англійської з ${name}.\nZoom: ${link}\n\nПодію створено CRM репетитора — змінюйте урок у CRM, а не тут.`,
      start: l.startAt,
      end: l.endAt,
    });
  }

  // 2) Які події CRM уже є в календарі
  const existing = new Map<string, Record<string, unknown>>();
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: until.toISOString(),
      singleEvents: "true",
      maxResults: "250",
      privateExtendedProperty: `${MARKER_KEY}=${MARKER_VALUE}`,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const r = await gcal("GET", `/calendars/${cal}/events?${params}`);
    if (!r.ok) {
      const msg = (r.json?.error as { message?: string } | undefined)?.message;
      throw new Error(
        r.status === 404 || r.status === 403
          ? "Немає доступу до календаря. Перевірте, що Саша відкрила доступ службовому акаунту («Вносити зміни в події»)."
          : `Помилка календаря: ${msg || r.status}`
      );
    }
    for (const item of (r.json?.items as Record<string, unknown>[]) ?? []) {
      existing.set(String(item.id), item);
    }
    pageToken = (r.json?.nextPageToken as string | undefined) ?? undefined;
  } while (pageToken);

  let created = 0;
  let updated = 0;
  let deleted = 0;

  // 3) Додаємо / оновлюємо
  for (const d of desired.values()) {
    const ev = existing.get(d.id);
    if (!ev) {
      const r = await gcal("POST", `/calendars/${cal}/events`, eventBody(d));
      if (r.ok) {
        created++;
      } else if (r.status === 409) {
        // подію з таким id колись видалили — відновлюємо
        const p = await gcal("PATCH", `/calendars/${cal}/events/${d.id}`, eventBody(d));
        if (p.ok) updated++;
        else console.error("Calendar restore failed", p.status, p.json);
      } else {
        console.error("Calendar insert failed", r.status, r.json);
      }
      continue;
    }
    const evStart = new Date(String((ev.start as { dateTime?: string })?.dateTime ?? 0)).getTime();
    const evEnd = new Date(String((ev.end as { dateTime?: string })?.dateTime ?? 0)).getTime();
    const changed =
      ev.summary !== d.summary ||
      ev.location !== d.location ||
      evStart !== d.start.getTime() ||
      evEnd !== d.end.getTime();
    if (changed) {
      const p = await gcal("PATCH", `/calendars/${cal}/events/${d.id}`, eventBody(d));
      if (p.ok) updated++;
      else console.error("Calendar update failed", p.status, p.json);
    }
  }

  // 4) Видаляємо події уроків, яких більше немає (скасовані, перенесені поза вікно, видалені)
  for (const [id] of existing) {
    if (!desired.has(id)) {
      const r = await gcal("DELETE", `/calendars/${cal}/events/${id}`);
      if (r.ok || r.status === 404 || r.status === 410) deleted++;
      else console.error("Calendar delete failed", r.status, r.json);
    }
  }

  return { created, updated, deleted, skippedNoLink };
}

// Безпечний виклик після змін уроків: не ламає основну дію, якщо з календарем щось не так
export async function syncCalendarSafely(): Promise<void> {
  if (!isCalendarConfigured()) return;
  try {
    await reconcileCalendar();
  } catch (e) {
    console.error("Calendar sync error", e);
  }
}
