import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runOpenAIHealthCheck } from "@/lib/analysis";

export async function GET() {
  let database: "OK" | "ERROR" = "OK";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "ERROR";
  }

  const llm = await runOpenAIHealthCheck();

  return NextResponse.json({
    backend: "OK",
    database,
    llm,
  });
}