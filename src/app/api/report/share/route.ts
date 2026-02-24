import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { createPublicReportToken } from "@/lib/share-report";
import { normalizeUrl } from "@/lib/url";

const ALLOWED_EXPIRY_HOURS = new Set([24, 72, 168]);

export async function POST(request: Request) {
  const start = Date.now();

  try {
    const body = (await request.json()) as { url?: string; expiresInHours?: number };
    const url = normalizeUrl(body.url || "");
    const expiresInHours = Number(body.expiresInHours || 72);

    const safeExpiry = ALLOWED_EXPIRY_HOURS.has(expiresInHours) ? expiresInHours : 72;

    const review = await prisma.review.findFirst({
      where: { url },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!review) {
      return NextResponse.json(
        {
          ok: false,
          error: "No review found for this URL.",
        },
        { status: 404 },
      );
    }

    const expiresAt = Date.now() + safeExpiry * 60 * 60 * 1000;
    const token = createPublicReportToken({
      reviewId: review.id,
      expiresAt,
    });

    const origin = new URL(request.url).origin;
    const publicUrl = `${origin}/report/${encodeURIComponent(token)}`;

    logger.info("api.report.share.success", {
      url,
      expiresInHours: safeExpiry,
      durationMs: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      publicUrl,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    logger.error("api.report.share.error", {
      durationMs: Date.now() - start,
      error,
    });

    const message = error instanceof Error ? error.message : "Failed to generate share link.";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 400 },
    );
  }
}
