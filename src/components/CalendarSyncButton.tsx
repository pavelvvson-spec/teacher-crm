"use client";

import { useState } from "react";

export default function CalendarSyncButton() {
  const [loading, setLoading] = useState(false);

  return (
    <form action="/api/google-calendar/sync" method="post" onSubmit={() => setLoading(true)}>
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
      >
        {loading ? "⏳ Синхронізую… (до хвилини, не закривайте сторінку)" : "Синхронізувати календар зараз"}
      </button>
    </form>
  );
}
