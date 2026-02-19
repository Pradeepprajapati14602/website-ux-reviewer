import { NextResponse } from "next/server";
import { analyzeAndSave } from "@/lib/review-service";
import { normalizeUrl } from "@/lib/url";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { leftUrl?: string; rightUrl?: string };
    const leftUrl = normalizeUrl(body.leftUrl || "");
    const rightUrl = normalizeUrl(body.rightUrl || "");

    const [leftReview, rightReview] = await Promise.all([
      analyzeAndSave(leftUrl),
      analyzeAndSave(rightUrl),
    ]);

    return NextResponse.json({
      ok: true,
      left: { url: leftUrl, review: leftReview },
      right: { url: rightUrl, review: rightReview },
      scoreDifference: rightReview.score - leftReview.score,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error during comparison.";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 400 },
    );
  }
}