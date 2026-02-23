import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createScheduledAudit, getScheduledAudits, removeScheduledAudit } from "@/lib/review-service";
import { normalizeUrl } from "@/lib/url";

export async function GET() {
  try {
    const audits = await getScheduledAudits();

    return NextResponse.json({
      ok: true,
      audits,
    });
  } catch (error) {
    logger.error("api.schedule.get.error", { error });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to fetch scheduled audits.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const start = Date.now();

  try {
    const body = (await request.json()) as { url?: string; frequency?: "daily" | "weekly" | "monthly" };

    if (!body.url) {
      return NextResponse.json(
        {
          ok: false,
          error: "URL is required.",
        },
        { status: 400 },
      );
    }

    const url = normalizeUrl(body.url);
    const frequency = body.frequency || "weekly";

    await createScheduledAudit(url, frequency);

    logger.info("api.schedule.create.success", {
      url,
      frequency,
      durationMs: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      url,
      frequency,
    });
  } catch (error) {
    logger.error("api.schedule.create.error", {
      durationMs: Date.now() - start,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to create scheduled audit.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const start = Date.now();

  try {
    const body = (await request.json()) as { id?: string };

    if (!body.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "ID is required.",
        },
        { status: 400 },
      );
    }

    await removeScheduledAudit(body.id);

    logger.info("api.schedule.delete.success", {
      id: body.id,
      durationMs: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    logger.error("api.schedule.delete.error", {
      durationMs: Date.now() - start,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to remove scheduled audit.",
      },
      { status: 500 },
    );
  }
}
