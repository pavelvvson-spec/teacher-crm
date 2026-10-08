import { NextRequest } from "next/server";
import { handleFirefliesWebhook } from "@/lib/fireflies-webhook";

export const maxDuration = 60;

// Варіант адреси з секретом у шляху: /api/fireflies/webhook/<секрет>
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  return handleFirefliesWebhook(request, decodeURIComponent(token));
}
