import { NextRequest } from "next/server";
import { handleFirefliesWebhook } from "@/lib/fireflies-webhook";

export const maxDuration = 60;

// Fireflies викликає цю адресу, коли запис уроку оброблено
export async function POST(request: NextRequest) {
  return handleFirefliesWebhook(request, null);
}
