import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { analyzeAndSave, type AnalysisResult } from "@/lib/review-service";
import { normalizeUrl } from "@/lib/url";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  try {
    logger.info("api.analyze.request", {
      requestId,
      method: request.method,
      path: "/api/analyze",
    });

    const body = (await request.json()) as { url?: string };
    const normalizedUrl = normalizeUrl(body.url || "");
    const review = await analyzeAndSave(normalizedUrl, {
      requestId,
      source: "api.analyze",
    });

    logger.info("api.analyze.success", {
      requestId,
      path: "/api/analyze",
      url: normalizedUrl,
      score: review.score,
      durationMs: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      url: normalizedUrl,
      review,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error during analysis.";

    logger.error("api.analyze.error", {
      requestId,
      path: "/api/analyze",
      durationMs: Date.now() - start,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 400 },
    );
  }
}