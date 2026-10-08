// Спільна функція виклику Claude API для всіх ШІ-функцій CRM.
// Ключ береться лише зі змінних середовища Vercel (ANTHROPIC_API_KEY).

export type ClaudeResult = { ok: true; text: string } | { ok: false; error: string };

// Блок повідомлення: текст або картинка (base64)
export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export async function callClaude(
  system: string,
  userPrompt: string | ClaudeContentBlock[],
  maxTokens = 3000
): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Не налаштовано ключ ШІ (ANTHROPIC_API_KEY у змінних Vercel)" };
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch {
    return { ok: false, error: "Не вдалося зв'язатися з ШІ" };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Anthropic API error", res.status, errText);
    const hint =
      res.status === 401
        ? "неправильний ключ"
        : res.status === 400 && errText.includes("credit")
          ? "закінчився баланс у консолі Anthropic"
          : `код ${res.status}`;
    return { ok: false, error: `ШІ повернув помилку: ${hint}` };
  }

  const data = await res.json();
  const text: string = (data?.content ?? [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("");
  return { ok: true, text };
}

// Збирає записи журналу в текст для ШІ: від старіших до новіших,
// обмежуючи загальний обсяг (найновіші записи мають пріоритет).
export function journalToText(
  entries: { content: string; source: string; createdAt: Date }[],
  maxChars = 20000
): string {
  const SOURCE_UA: Record<string, string> = {
    TEXT: "запис",
    VOICE: "голосове",
    FIREFLIES: "запис уроку",
  };
  const sorted = [...entries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const picked: string[] = [];
  let total = 0;
  for (const e of sorted) {
    const date = e.createdAt.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" });
    const line = `- ${date} (${SOURCE_UA[e.source] ?? e.source}): ${e.content}`;
    if (total + line.length > maxChars) break;
    picked.push(line);
    total += line.length;
  }
  return picked.length ? picked.reverse().join("\n") : "Журнал порожній.";
}
