import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { normalizeUrl } from "@/lib/url";

type ReportIssue = {
  title: string;
  why: string;
  severity: "low" | "medium" | "high";
  category?: string;
  confidence?: "high" | "medium" | "low";
  impactScore?: number;
  effortScore?: number;
  priorityScore?: number;
  priorityLabel?: "critical" | "high" | "medium" | "low" | "quick_win";
  fixSnippet?: string;
};

type ReportResult = {
  score?: number;
  issues?: ReportIssue[];
  top_improvements?: Array<{ before: string; after: string }>;
  accessibility?: { score?: number };
  seo?: { score?: number };
  visual?: { score?: number };
};

function scoreToColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#ca8a04";
  return "#dc2626";
}

function toScore(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function priorityValue(label?: string): number {
  switch (label) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "quick_win":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function buildRadarPolygon(scores: { ux: number; performance: number; accessibility: number; seo: number }): string {
  const centerX = 110;
  const centerY = 110;
  const radius = 70;

  const points = [
    { angle: -90, value: scores.ux },
    { angle: 0, value: scores.performance },
    { angle: 90, value: scores.accessibility },
    { angle: 180, value: scores.seo },
  ].map((point) => {
    const ratio = point.value / 100;
    const r = radius * ratio;
    const rad = (point.angle * Math.PI) / 180;
    const x = centerX + r * Math.cos(rad);
    const y = centerY + r * Math.sin(rad);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return points.join(" ");
}

function buildTrendPolyline(points: number[], width = 460, height = 140): string {
  if (points.length <= 1) {
    return "";
  }

  const step = width / Math.max(points.length - 1, 1);

  return points
    .map((value, index) => {
      const x = index * step;
      const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export async function GET(request: Request) {
  const start = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const urlParam = searchParams.get("url");

    if (!urlParam) {
      return NextResponse.json(
        {
          ok: false,
          error: "URL parameter is required.",
        },
        { status: 400 },
      );
    }

    const url = normalizeUrl(urlParam);

    const latestReview = await prisma.review.findFirst({
      where: { url },
      orderBy: { createdAt: "desc" },
    });

    if (!latestReview) {
      return NextResponse.json(
        {
          ok: false,
          error: "No review found for this URL.",
        },
        { status: 404 },
      );
    }

    const previousReview = await prisma.review.findFirst({
      where: {
        url,
        createdAt: {
          lt: latestReview.createdAt,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const history = await prisma.review.findMany({
      where: { url },
      orderBy: { createdAt: "asc" },
      take: 6,
      select: {
        score: true,
        websiteHealthScore: true,
        createdAt: true,
      },
    });

    const result = (latestReview.result || {}) as ReportResult;
    const issues = (Array.isArray(result.issues) ? result.issues : []).slice(0, 20);

    const uxScore = toScore(result.score ?? latestReview.score);
    const accessibilityScore = toScore(result.accessibility?.score, uxScore);
    const seoScore = toScore(result.seo?.score, uxScore);
    const performanceScore = toScore(
      (latestReview.performanceReport as { overallPerformanceScore?: number } | null)?.overallPerformanceScore,
      50,
    );
    const healthScore = latestReview.websiteHealthScore ?? null;

    const scoredIssues = issues
      .map((issue) => {
        const impact = toScore(issue.impactScore, issue.severity === "high" ? 90 : issue.severity === "medium" ? 65 : 40);
        const effort = toScore(issue.effortScore, 45);
        const priority = toScore(issue.priorityScore, Math.round((impact * (110 - effort)) / 100));

        return {
          ...issue,
          impact,
          effort,
          priority,
          priorityLabel: issue.priorityLabel || "medium",
        };
      })
      .sort((a, b) => {
        const labelDiff = priorityValue(b.priorityLabel) - priorityValue(a.priorityLabel);
        if (labelDiff !== 0) return labelDiff;
        return b.priority - a.priority;
      });

    const topPriorities = scoredIssues.slice(0, 5);

    const newIssuesCount = previousReview
      ? Math.max(0, scoredIssues.length - (((previousReview.result as ReportResult)?.issues || []).length || 0))
      : 0;

    const scoreDelta = previousReview ? latestReview.score - previousReview.score : 0;
    const healthDelta =
      previousReview && previousReview.websiteHealthScore !== null && latestReview.websiteHealthScore !== null
        ? latestReview.websiteHealthScore - previousReview.websiteHealthScore
        : null;

    const trendUx = history.map((item) => item.score);
    const trendHealth = history.map((item) => item.websiteHealthScore ?? 0);
    const trendLabels = history.map((item) => new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }));

    const uxPolyline = buildTrendPolyline(trendUx);
    const healthPolyline = buildTrendPolyline(trendHealth);

    const domain = new URL(url).hostname;
    const reportDate = new Date(latestReview.createdAt).toLocaleString();
    const radarPolygon = buildRadarPolygon({
      ux: uxScore,
      performance: performanceScore,
      accessibility: accessibilityScore,
      seo: seoScore,
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Executive UX Report - ${domain}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; }
    .page { max-width: 980px; margin: 0 auto; padding: 28px; }
    .header { border-bottom: 2px solid #111827; margin-bottom: 20px; padding-bottom: 12px; }
    .header h1 { margin: 0 0 4px; font-size: 24px; }
    .muted { color: #6b7280; font-size: 12px; }
    .grid { display: grid; gap: 10px; }
    .grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #fff; }
    .score { font-size: 28px; font-weight: 700; }
    .section-title { margin: 16px 0 10px; font-size: 16px; }
    .delta-positive { color: #16a34a; }
    .delta-negative { color: #dc2626; }
    .delta-neutral { color: #6b7280; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: 8px; vertical-align: top; }
    pre { margin: 6px 0 0; padding: 8px; border-radius: 8px; background: #f3f4f6; font-size: 11px; overflow-x: auto; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; border: 1px solid #d1d5db; }
    .footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>Executive UX Audit Report</h1>
      <div>${domain}</div>
      <div class="muted">Generated on ${reportDate}</div>
    </div>

    <h2 class="section-title">Executive Summary</h2>
    <div class="grid grid-4">
      <div class="card">
        <div class="muted">UX Score</div>
        <div class="score" style="color:${scoreToColor(uxScore)}">${uxScore}</div>
      </div>
      <div class="card">
        <div class="muted">Health Score</div>
        <div class="score" style="color:${scoreToColor(healthScore ?? 50)}">${healthScore ?? "N/A"}</div>
      </div>
      <div class="card">
        <div class="muted">Total Issues</div>
        <div class="score">${scoredIssues.length}</div>
      </div>
      <div class="card">
        <div class="muted">New vs Previous</div>
        <div class="score">${newIssuesCount}</div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: 1fr 1fr; margin-top: 12px;">
      <div class="card">
        <h3 style="margin:0 0 8px;">Risk Radar</h3>
        <svg width="220" height="220" viewBox="0 0 220 220" role="img" aria-label="Risk radar chart">
          <circle cx="110" cy="110" r="70" fill="none" stroke="#e5e7eb" />
          <circle cx="110" cy="110" r="52" fill="none" stroke="#e5e7eb" />
          <circle cx="110" cy="110" r="35" fill="none" stroke="#e5e7eb" />
          <line x1="110" y1="40" x2="110" y2="180" stroke="#e5e7eb" />
          <line x1="40" y1="110" x2="180" y2="110" stroke="#e5e7eb" />
          <polygon points="${radarPolygon}" fill="rgba(37,99,235,0.25)" stroke="#2563eb" stroke-width="2" />
          <text x="108" y="16" font-size="10">UX</text>
          <text x="184" y="112" font-size="10">Perf</text>
          <text x="96" y="214" font-size="10">A11y</text>
          <text x="8" y="112" font-size="10">SEO</text>
        </svg>
      </div>
      <div class="card">
        <h3 style="margin:0 0 8px;">Change Snapshot</h3>
        <p class="${scoreDelta > 0 ? "delta-positive" : scoreDelta < 0 ? "delta-negative" : "delta-neutral"}">UX delta: ${scoreDelta >= 0 ? "+" : ""}${scoreDelta}</p>
        <p class="${healthDelta === null ? "delta-neutral" : healthDelta > 0 ? "delta-positive" : healthDelta < 0 ? "delta-negative" : "delta-neutral"}">Health delta: ${healthDelta === null ? "N/A" : `${healthDelta >= 0 ? "+" : ""}${healthDelta}`}</p>
        <p class="muted">Accessibility: ${accessibilityScore}/100</p>
        <p class="muted">SEO: ${seoScore}/100</p>
        <p class="muted">Performance: ${performanceScore}/100</p>
      </div>
    </div>

    <h2 class="section-title">Top 5 Priorities</h2>
    <table>
      <thead>
        <tr>
          <th>Issue</th>
          <th>Impact</th>
          <th>Effort</th>
          <th>Priority</th>
        </tr>
      </thead>
      <tbody>
        ${topPriorities
          .map(
            (item) => `
          <tr>
            <td>
              <strong>${item.title}</strong>
              <div class="muted">${item.why}</div>
              ${item.fixSnippet ? `<pre>${item.fixSnippet.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>` : ""}
            </td>
            <td>${item.impact}</td>
            <td>${item.effort}</td>
            <td><span class="badge">${item.priorityLabel} (${item.priority})</span></td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>

    <h2 class="section-title">Trend (Last ${history.length})</h2>
    <div class="card">
      <svg width="460" height="170" viewBox="0 0 460 170" role="img" aria-label="Score trend graph">
        <line x1="0" y1="140" x2="460" y2="140" stroke="#d1d5db" />
        ${uxPolyline ? `<polyline fill="none" stroke="#2563eb" stroke-width="2" points="${uxPolyline}" />` : ""}
        ${healthPolyline ? `<polyline fill="none" stroke="#16a34a" stroke-width="2" points="${healthPolyline}" />` : ""}
        ${trendLabels
          .map((label, index) => {
            const x = history.length > 1 ? (460 / (history.length - 1)) * index : 0;
            return `<text x="${x.toFixed(1)}" y="158" font-size="10" text-anchor="middle">${label}</text>`;
          })
          .join("")}
      </svg>
      <div class="muted">Blue: UX · Green: Health</div>
    </div>

    <div class="footer">
      Generated by UX Auditor · ${reportDate}
    </div>
  </div>
</body>
</html>
    `;

    logger.info("api.pdf.success", {
      url,
      durationMs: Date.now() - start,
    });

    return new NextResponse(htmlContent, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="ux-audit-exec-${domain.replace(/\./g, "-")}.pdf"`,
      },
    });
  } catch (error) {
    logger.error("api.pdf.error", {
      durationMs: Date.now() - start,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate PDF report.",
      },
      { status: 500 },
    );
  }
}
