import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Видає браузеру одноразовий дозвіл завантажити частину підручника прямо у Vercel Blob
// (великі PDF не проходять через сервер — у Vercel ліміт 4,5 МБ на запит).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Немає даних" }, { status: 400 });
  try {
    const result = await handleUpload({
      body,
      request,
      token: process.env.BLOB2_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("textbooks/")) throw new Error("Неправильний шлях");
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 60 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
