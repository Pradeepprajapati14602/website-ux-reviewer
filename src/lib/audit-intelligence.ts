import type { UXIssue, AuditFinding, UXReview } from "@/lib/analysis";
import type { PerformanceReport } from "@/lib/performance";

export type ConfidenceLevel = "high" | "medium" | "low";
export type EvidenceSource = "deterministic" | "heuristic" | "ai_inferred";
export type PriorityLabel = "critical" | "high" | "medium" | "low" | "quick_win";

export type FindingIntelligence = {
  confidence: ConfidenceLevel;
  evidenceWeight: number;
  sourceType: EvidenceSource;
  impactScore: number;
  effortScore: number;
  priorityScore: number;
  priorityLabel: PriorityLabel;
  fixSnippet?: string;
};

export type MetricHighlight = {
  metric: string;
  before: string;
  after: string;
  status: "improved" | "regressed" | "stable";
};

export type AuditDiff = {
  previousCreatedAt?: string;
  currentCreatedAt?: string;
  scoreDelta: number;
  healthDelta: number | null;
  accessibilityDelta: number;
  seoDelta: number;
  visualDelta: number;
  previousIssueCount: number;
  currentIssueCount: number;
  newIssues: string[];
  resolvedIssues: string[];
  metricHighlights: MetricHighlight[];
};

const severityImpact: Record<string, number> = {
  high: 90,
  medium: 65,
  low: 40,
};

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseTimeToSeconds(value: string): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase().trim();
  const numberMatch = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!numberMatch) {
    return null;
  }

  const amount = Number(numberMatch[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  if (normalized.includes("ms")) {
    return amount / 1000;
  }

  if (normalized.includes("s")) {
    return amount;
  }

  return amount;
}

function inferSourceType(evidence: string, why: string): EvidenceSource {
  const text = `${evidence} ${why}`.toLowerCase();

  if (/(#|\.|\[|aria-|role=|<\w+)/i.test(text)) {
    return "deterministic";
  }

  if (/(might|may|likely|appears|seems|could)/i.test(text)) {
    return "heuristic";
  }

  return "ai_inferred";
}

function estimateEvidenceWeight(evidence: string, sourceType: EvidenceSource): number {
  const base = Math.min(70, evidence.trim().length * 0.8);
  const sourceBoost = sourceType === "deterministic" ? 25 : sourceType === "heuristic" ? 10 : 0;
  const numericBoost = /\d/.test(evidence) ? 8 : 0;
  return clamp(base + sourceBoost + numericBoost);
}

function inferEffortScore(title: string, why: string): number {
  const text = `${title} ${why}`.toLowerCase();

  if (/(rename|update copy|alt text|label|contrast|heading|h1|aria-label|button text|link text)/.test(text)) {
    return 25;
  }

  if (/(spacing|alignment|responsive|layout|navigation|hierarchy|form flow)/.test(text)) {
    return 50;
  }

  if (/(re-architect|rewrite|major redesign|information architecture|checkout flow|auth flow)/.test(text)) {
    return 80;
  }

  return 45;
}

function inferFixSnippet(category: string, title: string): string | undefined {
  const text = `${category} ${title}`.toLowerCase();

  if (/(contrast|button)/.test(text)) {
    return ".button-primary {\n  background-color: #0052cc;\n  color: #ffffff;\n}";
  }

  if (/(alt|image|hero)/.test(text)) {
    return '<img src="hero.jpg" alt="Online booking dashboard preview" />';
  }

  if (/(h1|heading|title)/.test(text)) {
    return "<h1>Book appointments faster with real-time availability</h1>";
  }

  if (/(form|label|input)/.test(text)) {
    return '<label for="email">Work email</label>\n<input id="email" name="email" type="email" required />';
  }

  return undefined;
}

function inferPriorityLabel(priorityScore: number, impact: number, effort: number): PriorityLabel {
  if (impact >= 65 && effort <= 35) {
    return "quick_win";
  }

  if (priorityScore >= 70) {
    return "critical";
  }

  if (priorityScore >= 55) {
    return "high";
  }

  if (priorityScore >= 40) {
    return "medium";
  }

  return "low";
}

function enrichFinding<T extends UXIssue | AuditFinding>(item: T): T {
  const sourceType = item.sourceType || inferSourceType(item.evidence || "", item.why || "");
  const evidenceWeight = clamp(toNumber(item.evidenceWeight, estimateEvidenceWeight(item.evidence || "", sourceType)));

  let confidence: ConfidenceLevel = item.confidence || "medium";
  if (!item.confidence) {
    if (sourceType === "deterministic" && evidenceWeight >= 75) {
      confidence = "high";
    } else if (evidenceWeight < 45 || sourceType === "ai_inferred") {
      confidence = "low";
    }
  }

  const impactScore = clamp(toNumber(item.impactScore, severityImpact[item.severity] ?? 55));
  const effortScore = clamp(toNumber(item.effortScore, inferEffortScore(item.title, item.why)));
  const priorityScore = clamp(toNumber(item.priorityScore, (impactScore * (110 - effortScore)) / 100));
  const priorityLabel = item.priorityLabel || inferPriorityLabel(priorityScore, impactScore, effortScore);

  return {
    ...item,
    confidence,
    evidenceWeight,
    sourceType,
    impactScore,
    effortScore,
    priorityScore,
    priorityLabel,
    fixSnippet: item.fixSnippet || inferFixSnippet((item as UXIssue).category || "", item.title),
  };
}

export function enrichReviewIntelligence(review: UXReview): UXReview {
  const issues = review.issues.map((issue) => enrichFinding(issue));

  const enrichList = (list: AuditFinding[]) => list.map((finding) => enrichFinding(finding));

  return {
    ...review,
    issues,
    ux: {
      ...review.ux,
      issues: review.ux.issues.map((issue) => enrichFinding(issue)),
    },
    accessibility: {
      ...review.accessibility,
      findings: enrichList(review.accessibility.findings),
    },
    seo: {
      ...review.seo,
      findings: enrichList(review.seo.findings),
    },
    visual: {
      ...review.visual,
      findings: enrichList(review.visual.findings),
    },
  };
}

function extractMetric(report: PerformanceReport | null | undefined, metricId: string): string | null {
  if (!report?.performance?.metrics?.length) {
    return null;
  }

  const metric = report.performance.metrics.find((item) => item.id === metricId);
  return metric?.displayValue || null;
}

export function buildAuditDiff(params: {
  previousReview: UXReview | null;
  currentReview: UXReview;
  previousScore: number | null;
  currentScore: number;
  previousHealthScore: number | null;
  currentHealthScore: number | null;
  previousPerformance: PerformanceReport | null;
  currentPerformance: PerformanceReport | null;
  previousCreatedAt?: Date;
  currentCreatedAt?: Date;
}): AuditDiff | null {
  if (!params.previousReview || params.previousScore === null) {
    return null;
  }

  const toKey = (issue: UXIssue) => `${issue.category}|${normalizeTitle(issue.title)}`;

  const previousIssues = params.previousReview.issues || [];
  const currentIssues = params.currentReview.issues || [];

  const previousSet = new Set(previousIssues.map(toKey));
  const currentSet = new Set(currentIssues.map(toKey));

  const newIssues = currentIssues
    .filter((issue) => !previousSet.has(toKey(issue)))
    .map((issue) => issue.title)
    .slice(0, 8);

  const resolvedIssues = previousIssues
    .filter((issue) => !currentSet.has(toKey(issue)))
    .map((issue) => issue.title)
    .slice(0, 8);

  const metricIds = [
    { id: "largest-contentful-paint", label: "LCP" },
    { id: "first-contentful-paint", label: "FCP" },
    { id: "cumulative-layout-shift", label: "CLS" },
  ];

  const metricHighlights: MetricHighlight[] = metricIds
    .map(({ id, label }) => {
      const before = extractMetric(params.previousPerformance, id);
      const after = extractMetric(params.currentPerformance, id);

      if (!before || !after) {
        return null;
      }

      const beforeNumber = parseTimeToSeconds(before);
      const afterNumber = parseTimeToSeconds(after);

      if (beforeNumber === null || afterNumber === null) {
        return {
          metric: label,
          before,
          after,
          status: "stable" as const,
        };
      }

      const tolerance = id === "cumulative-layout-shift" ? 0.03 : 0.15;
      let status: "improved" | "regressed" | "stable" = "stable";

      if (afterNumber < beforeNumber - tolerance) {
        status = "improved";
      } else if (afterNumber > beforeNumber + tolerance) {
        status = "regressed";
      }

      return {
        metric: label,
        before,
        after,
        status,
      };
    })
    .filter((item): item is MetricHighlight => Boolean(item));

  return {
    previousCreatedAt: params.previousCreatedAt?.toISOString(),
    currentCreatedAt: params.currentCreatedAt?.toISOString(),
    scoreDelta: params.currentScore - params.previousScore,
    healthDelta:
      params.previousHealthScore !== null && params.currentHealthScore !== null
        ? params.currentHealthScore - params.previousHealthScore
        : null,
    accessibilityDelta: params.currentReview.accessibility.score - params.previousReview.accessibility.score,
    seoDelta: params.currentReview.seo.score - params.previousReview.seo.score,
    visualDelta: params.currentReview.visual.score - params.previousReview.visual.score,
    previousIssueCount: previousIssues.length,
    currentIssueCount: currentIssues.length,
    newIssues,
    resolvedIssues,
    metricHighlights,
  };
}
