"use client";

import { useState } from "react";

export default function CalendarSyncButton() {
  const [loading, setLoading] = useState(false);

  return (
    <form action="/api/google-calendar/sync" method="post" onSubmit={() => setLoading(true)}>
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-60"
      >
        {loading ? "⏳ Синхронізую… (до хвилини, не закривайте сторінку)" : "Синхронізувати календар зараз"}
      </button>
    </form>
  );
}
