import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getScoreHistory } from "@/lib/review-service";
import { normalizeUrl } from "@/lib/url";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ url: string }> }
) {
  const start = Date.now();

  try {
    const { url: encodedUrl } = await params;
    const url = decodeURIComponent(encodedUrl);
    const normalizedUrl = normalizeUrl(url);

    const limit = Number(new URL(request.url).searchParams.get("limit") || "30");

    const history = await getScoreHistory(normalizedUrl, Math.min(limit, 100));

    logger.info("api.history.get.success", {
      url: normalizedUrl,
      count: history.length,
      durationMs: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      url: normalizedUrl,
      history,
    });
  } catch (error) {
    logger.error("api.history.get.error", {
      durationMs: Date.now() - start,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to fetch history.",
      },
      { status: 500 },
    );
  }
}
