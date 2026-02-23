import { Prisma, ScheduledAudit } from "@prisma/client";
import { runUxAudit, type UXReview } from "@/lib/analysis";
import { extractWebsiteContent, type ExtractedPageContent } from "@/lib/extractor";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  getPerformanceReport,
  calculateWebsiteHealthScore,
  type PerformanceReport,
} from "@/lib/performance";
import { sendScoreDropAlert, sendAuditCompleteAlert } from "@/lib/alerts";

const MAX_HISTORY = 100;

type AnalyzeContext = {
  requestId?: string;
  source?: string;
};

export type AnalysisResult = UXReview & {
  screenshots: {
    fullPage: string;
    aboveTheFold: string;
    mobile: string;
  };
  performance: PerformanceReport;
  websiteHealthScore: number;
};

async function keepLastFiveReviews(): Promise<number> {
  const oldReviews = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    skip: MAX_HISTORY,
    select: { id: true },
  });

  if (!oldReviews.length) {
    return 0;
  }

  const result = await prisma.review.deleteMany({
    where: {
      id: {
        in: oldReviews.map((review) => review.id),
      },
    },
  });

  return result.count;
}

export type ScoreHistoryItem = {
  id: string;
  url: string;
  score: number;
  websiteHealthScore: number | null;
  createdAt: Date;
};

export async function getScoreHistory(url: string, limit: number = 30): Promise<ScoreHistoryItem[]> {
  return await prisma.review.findMany({
    where: { url },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      url: true,
      score: true,
      websiteHealthScore: true,
      createdAt: true,
    },
  });
}

export async function getScheduledAudits(): Promise<ScheduledAudit[]> {
  return await prisma.scheduledAudit.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function createScheduledAudit(url: string, frequency: "daily" | "weekly" | "monthly"): Promise<void> {
  await prisma.scheduledAudit.create({
    data: {
      url,
      frequency,
      nextRunAt: calculateNextRunDate(frequency),
    },
  });
}

export async function removeScheduledAudit(id: string): Promise<void> {
  await prisma.scheduledAudit.delete({
    where: { id },
  });
}

export async function runScheduledAudits(): Promise<void> {
  const now = new Date();
  const dueAudits = await prisma.scheduledAudit.findMany({
    where: {
      active: true,
      nextRunAt: { lte: now },
    },
  });

  for (const audit of dueAudits) {
    try {
      await analyzeAndSave(audit.url, {
        source: "scheduled.audit",
      });

      const nextRun = calculateNextRunDate(audit.frequency as "daily" | "weekly" | "monthly");

      await prisma.scheduledAudit.update({
        where: { id: audit.id },
        data: {
          lastRunAt: now,
          nextRunAt: nextRun,
        },
      });

      logger.info("scheduled.audit.completed", {
        auditId: audit.id,
        url: audit.url,
        frequency: audit.frequency,
      });
    } catch (error) {
      logger.error("scheduled.audit.failed", {
        auditId: audit.id,
        url: audit.url,
        frequency: audit.frequency,
        error,
      });
    }
  }
}

function calculateNextRunDate(frequency: "daily" | "weekly" | "monthly"): Date {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
  }

  return next;
}

export async function analyzeAndSave(url: string, context: AnalyzeContext = {}): Promise<AnalysisResult> {
  const start = Date.now();
  const { requestId, source = "unknown" } = context;

  logger.info("review.analyze.start", {
    requestId,
    source,
    url,
  });

  try {
    // Get previous score for alert comparison
    const previousReview = await prisma.review.findFirst({
      where: { url },
      orderBy: { createdAt: "desc" },
      select: { score: true, websiteHealthScore: true },
    });

    const extracted = await extractWebsiteContent(url);
    const review = await runUxAudit(extracted);

    const performance = await getPerformanceReport(url);

    const websiteHealthScore = calculateWebsiteHealthScore({
      uxScore: review.score,
      performanceScore: performance.overallPerformanceScore,
      accessibilityScore: review.accessibility.score,
      seoScore: review.seo.score,
    });

    await prisma.review.create({
      data: {
        url,
        score: review.score,
        result: review as Prisma.InputJsonValue,
        visualFullPage: extracted.visual.fullPage,
        visualAboveFold: extracted.visual.aboveTheFold,
        visualMobile: extracted.visual.mobile,
        performanceReport: performance as Prisma.InputJsonValue,
        websiteHealthScore,
      },
    });

    const prunedCount = await keepLastFiveReviews();

    // Check for score drops and send alerts
    if (previousReview) {
      const scoreDrop = previousReview.score - review.score;
      const healthScoreDrop = previousReview.websiteHealthScore && previousReview.websiteHealthScore - websiteHealthScore;

      if (scoreDrop >= 10 || (healthScoreDrop && healthScoreDrop >= 10)) {
        await sendScoreDropAlert({
          url,
          oldScore: previousReview.score,
          newScore: review.score,
          oldHealthScore: previousReview.websiteHealthScore ?? undefined,
          newHealthScore: websiteHealthScore,
          timestamp: new Date(),
        });
      }
    }

    // Send audit complete alert for scheduled audits
    if (source === "scheduled.audit") {
      await sendAuditCompleteAlert(url, review.score, websiteHealthScore);
    }

    logger.info("review.analyze.success", {
      requestId,
      source,
      url,
      score: review.score,
      websiteHealthScore,
      performanceScore: performance.overallPerformanceScore,
      issuesCount: review.issues.length,
      prunedCount,
      durationMs: Date.now() - start,
    });

    return {
      ...review,
      screenshots: extracted.visual,
      performance,
      websiteHealthScore,
    };
  } catch (error) {
    logger.error("review.analyze.error", {
      requestId,
      source,
      url,
      durationMs: Date.now() - start,
      error,
    });
    throw error;
  }
}