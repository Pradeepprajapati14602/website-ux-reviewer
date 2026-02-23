import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { analyzeAndSave } from "@/lib/review-service";
import { normalizeUrl } from "@/lib/url";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  try {
    logger.info("api.compare.request", {
      requestId,
      method: request.method,
      path: "/api/compare",
    });

    const body = (await request.json()) as { leftUrl?: string; rightUrl?: string };
    const leftUrl = normalizeUrl(body.leftUrl || "");
    const rightUrl = normalizeUrl(body.rightUrl || "");

    const [leftReview, rightReview] = await Promise.all([
      analyzeAndSave(leftUrl, { requestId, source: "api.compare.left" }),
      analyzeAndSave(rightUrl, { requestId, source: "api.compare.right" }),
    ]);

    logger.info("api.compare.success", {
      requestId,
      path: "/api/compare",
      leftUrl,
      rightUrl,
      leftScore: leftReview.score,
      rightScore: rightReview.score,
      scoreDifference: rightReview.score - leftReview.score,
      durationMs: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      left: { url: leftUrl, review: leftReview },
      right: { url: rightUrl, review: rightReview },
      scoreDifference: rightReview.score - leftReview.score,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error during comparison.";

    logger.error("api.compare.error", {
      requestId,
      path: "/api/compare",
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