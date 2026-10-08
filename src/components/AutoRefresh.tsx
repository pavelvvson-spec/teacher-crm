"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Тихо оновлює дані сторінки раз на хвилину (щоб уроки самі позначались завершеними)
export default function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
