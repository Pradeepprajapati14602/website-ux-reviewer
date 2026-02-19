import { NextResponse } from "next/server";
import { analyzeAndSave } from "@/lib/review-service";
import { normalizeUrl } from "@/lib/url";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const normalizedUrl = normalizeUrl(body.url || "");
    const review = await analyzeAndSave(normalizedUrl);

    return NextResponse.json({
      ok: true,
      url: normalizedUrl,
      review,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error during analysis.";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 400 },
    );
  }
}