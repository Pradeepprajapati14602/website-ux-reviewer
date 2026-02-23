import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { runScheduledAudits } from "@/lib/review-service";

export async function POST(request: Request) {
  const start = Date.now();

  try {
    // Simple authentication using API key or cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized.",
        },
        { status: 401 },
      );
    }

    await runScheduledAudits();

    logger.info("api.cron.run.success", {
      durationMs: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      message: "Scheduled audits completed.",
    });
  } catch (error) {
    logger.error("api.cron.run.error", {
      durationMs: Date.now() - start,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to run scheduled audits.",
      },
      { status: 500 },
    );
  }
}
