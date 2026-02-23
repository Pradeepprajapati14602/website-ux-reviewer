import { logger } from "@/lib/logger";

const PSI_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_API_KEY = process.env.PAGESPEED_API_KEY;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export type PerformanceCategory = "performance" | "accessibility" | "best-practices" | "seo";

export type PerformanceMetric = {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue: string;
};

export type PerformanceData = {
  id: string;
  title: string;
  score: number;
  metrics: PerformanceMetric[];
};

export type PerformanceReport = {
  performance: PerformanceData;
  accessibility: PerformanceData;
  bestPractices: PerformanceData;
  seo: PerformanceData;
  overallPerformanceScore: number;
  timestamp: number;
};

type PSIResponse = {
  id: string;
  loadingExperience: {
    id: string;
    metrics: Array<{
      key: string;
      value: number;
    }>;
  };
  lighthouseResult: {
    categories: {
      performance?: { score: number };
      accessibility?: { score: number };
      ["best-practices"]?: { score: number };
      seo?: { score: number };
    };
    audits: {
      [key: string]: {
        id: string;
        title: string;
        description: string;
        score: number | null;
        displayValue?: string;
      };
    };
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function normalizeScore(value: number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return Math.round(Math.max(0, Math.min(100, value * 100)));
}

function extractMetrics(audits: PSIResponse["lighthouseResult"]["audits"]): PerformanceMetric[] {
  const keyMetrics = [
    "first-contentful-paint",
    "largest-contentful-paint",
    "total-blocking-time",
    "cumulative-layout-shift",
    "speed-index",
    "interactive",
  ];

  return keyMetrics
    .map((key) => {
      const audit = audits[key];
      if (!audit) {
        return null;
      }

      return {
        id: audit.id,
        title: audit.title,
        description: audit.description,
        score: normalizeScore(audit.score),
        displayValue: audit.displayValue || "N/A",
      };
    })
    .filter((metric): metric is PerformanceMetric => metric !== null);
}

function createFallbackPerformanceReport(url: string): PerformanceReport {
  logger.warn("performance.fallback", { url });

  const fallbackMetrics: PerformanceMetric[] = [
    {
      id: "fallback-metric-1",
      title: "First Contentful Paint",
      description: "Time until first content is painted",
      score: 50,
      displayValue: "N/A (PageSpeed API unavailable)",
    },
    {
      id: "fallback-metric-2",
      title: "Largest Contentful Paint",
      description: "Time to render largest content",
      score: 50,
      displayValue: "N/A (PageSpeed API unavailable)",
    },
    {
      id: "fallback-metric-3",
      title: "Cumulative Layout Shift",
      description: "Visual stability score",
      score: 50,
      displayValue: "N/A (PageSpeed API unavailable)",
    },
  ];

  return {
    performance: {
      id: "performance",
      title: "Performance",
      score: 50,
      metrics: fallbackMetrics,
    },
    accessibility: {
      id: "accessibility",
      title: "Accessibility",
      score: 50,
      metrics: [],
    },
    bestPractices: {
      id: "best-practices",
      title: "Best Practices",
      score: 50,
      metrics: [],
    },
    seo: {
      id: "seo",
      title: "SEO",
      score: 50,
      metrics: [],
    },
    overallPerformanceScore: 50,
    timestamp: Date.now(),
  };
}

async function fetchPageSpeedInsights(url: string, strategy: "desktop" | "mobile" = "desktop"): Promise<PSIResponse> {
  if (!PSI_API_KEY) {
    throw new Error("PAGESPEED_API_KEY is not configured.");
  }

  const searchParams = new URLSearchParams({
    url,
    key: PSI_API_KEY,
    strategy,
    category: "performance,accessibility,best-practices,seo",
  });

  const response = await fetch(`${PSI_API_URL}?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error(`PageSpeed API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as PSIResponse;
}

export async function getPerformanceReport(url: string): Promise<PerformanceReport> {
  const start = Date.now();

  if (!PSI_API_KEY) {
    logger.warn("performance.missing_api_key", { url });
    return createFallbackPerformanceReport(url);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const [desktopResult, mobileResult] = await Promise.all([
        fetchPageSpeedInsights(url, "desktop"),
        fetchPageSpeedInsights(url, "mobile"),
      ]);

      const lhDesktop = desktopResult.lighthouseResult;
      const lhMobile = mobileResult.lighthouseResult;

      const perfScore = normalizeScore(lhDesktop.categories.performance?.score);
      const a11yScore = normalizeScore(lhDesktop.categories.accessibility?.score);
      const bestPracticesScore = normalizeScore(lhDesktop.categories["best-practices"]?.score);
      const seoScore = normalizeScore(lhDesktop.categories.seo?.score);

      const overallPerformanceScore = Math.round(
        perfScore * 0.5 +
          normalizeScore(lhMobile.categories.performance?.score) * 0.5
      );

      const report: PerformanceReport = {
        performance: {
          id: "performance",
          title: "Performance",
          score: perfScore,
          metrics: extractMetrics(lhDesktop.audits),
        },
        accessibility: {
          id: "accessibility",
          title: "Accessibility",
          score: a11yScore,
          metrics: [],
        },
        bestPractices: {
          id: "best-practices",
          title: "Best Practices",
          score: bestPracticesScore,
          metrics: [],
        },
        seo: {
          id: "seo",
          title: "SEO",
          score: seoScore,
          metrics: [],
        },
        overallPerformanceScore,
        timestamp: Date.now(),
      };

      logger.info("performance.success", {
        url,
        durationMs: Date.now() - start,
        perfScore,
        a11yScore,
        bestPracticesScore,
        seoScore,
        overallPerformanceScore,
        metricsCount: report.performance.metrics.length,
      });

      return report;
    } catch (error) {
      const isRetryable =
        error instanceof Error &&
        (RETRYABLE_STATUS_CODES.has((error as any).status) ||
          /timeout|timed out|network/i.test(error.message));

      if (isRetryable && attempt < MAX_RETRIES) {
        const waitMs = 500 * 2 ** attempt;
        logger.warn("performance.retry", {
          url,
          attempt: attempt + 1,
          waitMs,
          errorMessage: toErrorMessage(error),
        });
        await sleep(waitMs);
        continue;
      }

      logger.error("performance.error", {
        url,
        attempt: attempt + 1,
        durationMs: Date.now() - start,
        errorMessage: toErrorMessage(error),
      });

      return createFallbackPerformanceReport(url);
    }
  }

  throw new Error("Performance report failed after retries.");
}

export function calculateWebsiteHealthScore(params: {
  uxScore: number;
  performanceScore: number;
  accessibilityScore: number;
  seoScore: number;
}): number {
  const weights = {
    ux: 0.35,
    performance: 0.30,
    accessibility: 0.20,
    seo: 0.15,
  };

  const healthScore =
    params.uxScore * weights.ux +
    params.performanceScore * weights.performance +
    params.accessibilityScore * weights.accessibility +
    params.seoScore * weights.seo;

  return Math.round(Math.max(0, Math.min(100, healthScore)));
}
