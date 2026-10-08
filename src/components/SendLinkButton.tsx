"use client";

import { useState } from "react";

type Result = {
  mode: "sent" | "manual";
  channel: "TELEGRAM" | "VIBER";
  text: string;
  viberPhone?: string | null;
  telegramUsername?: string | null;
};

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function SendLinkButton({ lessonId }: { lessonId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function send() {
    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);
    const res = await fetch(`/api/lessons/${lessonId}/send-link`, { method: "POST" }).catch(() => null);
    setLoading(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setError(data.error || "Не вдалося підготувати посилання");
      return;
    }
    const r = data as Result;
    setResult(r);
    if (r.mode === "manual") {
      const ok = await copy(r.text);
      setCopied(ok);
      openApp(r);
    }
  }

  function openApp(r: Result) {
    if (r.channel === "VIBER") {
      if (r.viberPhone) {
        window.location.href = `viber://chat?number=%2B${r.viberPhone}`;
      } else {
        window.location.href = `viber://forward?text=${encodeURIComponent(r.text)}`;
      }
    } else if (r.telegramUsername) {
      window.open(`https://t.me/${r.telegramUsername}`, "_blank");
    } else {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(r.text)}`, "_blank");
    }
  }

  return (
    <div className="w-full space-y-2">
      <button
        onClick={send}
        disabled={loading}
        className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
      >
        {loading ? "Готую..." : "🔗 Надіслати посилання Zoom"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result?.mode === "sent" && (
        <p className="text-sm text-green-600">✓ Надіслано в Telegram автоматично</p>
      )}

      {result?.mode === "manual" && (
        <div className="bg-sky-50 rounded-xl p-3 space-y-2">
          <p className="text-sm text-gray-700">
            {result.channel === "VIBER"
              ? result.viberPhone
                ? "Відкрився Viber у чаті з учнем."
                : "Номер для Viber не вказано — виберіть контакт у Viber."
              : result.telegramUsername
                ? "Відкрився Telegram у чаті з учнем (учень не підключений до бота)."
                : "Відкрився Telegram — виберіть контакт."}{" "}
            {copied ? "Текст уже скопійовано — вставте його і натисніть «Надіслати»." : "Скопіюйте текст нижче."}
          </p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap bg-white rounded-lg px-3 py-2">{result.text}</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => setCopied(await copy(result.text))}
              className="px-3 py-1.5 bg-white text-gray-700 rounded-lg text-sm border hover:bg-gray-50"
            >
              {copied ? "✓ Скопійовано" : "Скопіювати текст"}
            </button>
            <button
              onClick={() => openApp(result)}
              className="px-3 py-1.5 bg-white text-gray-700 rounded-lg text-sm border hover:bg-gray-50"
            >
              Відкрити {result.channel === "VIBER" ? "Viber" : "Telegram"} ще раз
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
