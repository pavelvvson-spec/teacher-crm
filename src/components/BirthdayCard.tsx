"use client";

import { useState } from "react";

export type BirthdayPerson = {
  id: string;
  name: string;
  age: number | null;
  channel: "TELEGRAM" | "VIBER";
  telegramUsername: string | null;
  viberPhone: string | null;
  greeting: string;
};

function ageWord(n: number) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "рік";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "роки";
  return "років";
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function openChat(p: BirthdayPerson) {
  if (p.channel === "VIBER") {
    window.location.href = p.viberPhone
      ? `viber://chat?number=%2B${p.viberPhone}`
      : `viber://forward?text=${encodeURIComponent(p.greeting)}`;
  } else if (p.telegramUsername) {
    window.open(`https://t.me/${p.telegramUsername}`, "_blank");
  } else {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(p.greeting)}`, "_blank");
  }
}

// Блок «Сьогодні день народження» на головній
export default function BirthdayCard({ people }: { people: BirthdayPerson[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  if (!people.length) return null;

  return (
    <div className="rounded-2xl shadow-sm p-4 sm:p-5 bg-gradient-to-r from-amber-50 via-pink-50 to-purple-50 border border-pink-100 space-y-3">
      {people.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎂</span>
            <div>
              <p className="font-semibold text-gray-800">
                Сьогодні день народження у {p.name}!
              </p>
              <p className="text-sm text-gray-600">
                {p.age != null ? `Виповнюється ${p.age} ${ageWord(p.age)} 🎉` : "Не забудь привітати 🎉"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              const ok = await copy(p.greeting);
              setDone((d) => ({ ...d, [p.id]: ok }));
              openChat(p);
            }}
            className="px-4 py-2 bg-pink-600 text-white rounded-xl text-sm font-medium hover:bg-pink-700"
          >
            🎁 Привітати
          </button>
          {done[p.id] && (
            <p className="w-full text-xs text-gray-500">
              Текст привітання скопійовано — вставте його в чат і надішліть (або напишіть своє 💖)
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
