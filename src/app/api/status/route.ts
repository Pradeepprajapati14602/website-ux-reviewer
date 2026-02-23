import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runOpenAIHealthCheck } from "@/lib/analysis";
import { logger } from "@/lib/logger";

export async function GET() {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  let database: "OK" | "ERROR" = "OK";

  try {
    logger.info("api.status.request", {
      requestId,
      method: "GET",
      path: "/api/status",
    });

    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "ERROR";
  }

  const llm = await runOpenAIHealthCheck();

  logger.info("api.status.response", {
    requestId,
    path: "/api/status",
    database,
    llm,
    durationMs: Date.now() - start,
  });

  return NextResponse.json({
    backend: "OK",
    database,
    llm,
  });
}