import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { put, del } from "@vercel/blob";

// Матеріали чернетки наступного уроку (так само, як матеріали уроку)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const materials = await prisma.lessonMaterial.findMany({
    where: { draftStudentId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(materials);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || file?.name || "Файл";
    if (!file) return NextResponse.json({ error: "Файл не знайдено" }, { status: 400 });

    const blob = await put(`drafts/${id}/${Date.now()}-${file.name}`, file, {
      access: "public",
      token: process.env.BLOB2_READ_WRITE_TOKEN,
    });
    const type = file.type.includes("pdf") ? "PDF" : "IMAGE";
    const material = await prisma.lessonMaterial.create({
      data: { draftStudentId: id, type, title, url: blob.url },
    });
    await prisma.student.update({ where: { id }, data: { draftUpdatedAt: new Date() } });
    return NextResponse.json(material);
  }

  const body = await request.json().catch(() => null);
  if (!body?.url || !body?.title) {
    return NextResponse.json({ error: "Вкажіть назву та посилання" }, { status: 400 });
  }
  const type = body.url.includes("youtube.com") || body.url.includes("youtu.be") ? "YOUTUBE" : "LINK";
  const material = await prisma.lessonMaterial.create({
    data: { draftStudentId: id, type, title: body.title, url: body.url },
  });
  await prisma.student.update({ where: { id }, data: { draftUpdatedAt: new Date() } });
  return NextResponse.json(material);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.materialId) return NextResponse.json({ error: "Не вказано матеріал" }, { status: 400 });

  const material = await prisma.lessonMaterial.findFirst({ where: { id: body.materialId, draftStudentId: id } });
  if (!material) return NextResponse.json({ error: "Матеріал не знайдено" }, { status: 404 });
  if (material.type === "PDF" || material.type === "IMAGE") {
    const otherUses = await prisma.lessonMaterial.count({ where: { url: material.url, id: { not: material.id } } });
    if (otherUses === 0) await del(material.url, { token: process.env.BLOB2_READ_WRITE_TOKEN }).catch(() => null);
  }
  await prisma.lessonMaterial.delete({ where: { id: material.id } });
  return NextResponse.json({ success: true });
}
