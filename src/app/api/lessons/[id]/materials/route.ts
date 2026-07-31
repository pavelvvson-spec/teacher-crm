import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { put, del } from "@vercel/blob";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const materials = await prisma.lessonMaterial.findMany({
    where: { lessonId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(materials);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || file?.name || "Файл";

    if (!file) {
      return NextResponse.json({ error: "Файл не знайдено" }, { status: 400 });
    }

    const blob = await put(`lessons/${id}/${Date.now()}-${file.name}`, file, {
      access: "public",
    });

    const type = file.type.includes("pdf") ? "PDF" : "IMAGE";

    const material = await prisma.lessonMaterial.create({
      data: {
        lessonId: id,
        type,
        title,
        url: blob.url,
      },
    });

    return NextResponse.json(material);
  }

  const body = await request.json().catch(() => null);
  if (!body?.url || !body?.title) {
    return NextResponse.json({ error: "Вкажіть назву та посилання" }, { status: 400 });
  }

  const type = body.url.includes("youtube.com") || body.url.includes("youtu.be") ? "YOUTUBE" : "LINK";

  const material = await prisma.lessonMaterial.create({
    data: {
      lessonId: id,
      type,
      title: body.title,
      url: body.url,
    },
  });

  return NextResponse.json(material);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.materialId) {
    return NextResponse.json({ error: "Не вказано матеріал" }, { status: 400 });
  }

  const material = await prisma.lessonMaterial.findUnique({
    where: { id: body.materialId },
  });

  if (material && (material.type === "PDF" || material.type === "IMAGE")) {
    await del(material.url).catch(() => null);
  }

  await prisma.lessonMaterial.delete({ where: { id: body.materialId } });

  return NextResponse.json({ success: true });
}