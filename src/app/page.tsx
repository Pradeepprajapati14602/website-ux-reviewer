"use client";

import { useMemo, useState, useEffect } from "react";

type Issue = {
  category: "clarity" | "layout" | "navigation" | "accessibility" | "trust";
  title: string;
  why: string;
  evidence: string;
  severity: "low" | "medium" | "high";
};

type PerformanceMetric = {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue: string;
};

type PerformanceCategory = {
  id: string;
  title: string;
  score: number;
  metrics: PerformanceMetric[];
};

type PerformanceReport = {
  performance: PerformanceCategory;
  accessibility: PerformanceCategory;
  bestPractices: PerformanceCategory;
  seo: PerformanceCategory;
  overallPerformanceScore: number;
  timestamp: number;
};

type AuditSection = {
  score: number;
  findings: Array<{
    title: string;
    why: string;
    evidence: string;
    severity: "low" | "medium" | "high";
  }>;
};

type Review = {
  score: number;
  issues: Issue[];
  top_improvements: Array<{ before: string; after: string }>;
  screenshots?: {
    fullPage: string;
    aboveTheFold: string;
    mobile: string;
  };
  performance?: PerformanceReport;
  websiteHealthScore?: number;
  accessibility: AuditSection;
  seo: AuditSection;
  visual: AuditSection;
};

type AnalyzeResponse = {
  ok: boolean;
  error?: string;
  url?: string;
  review?: Review;
};

type CompareResponse = {
  ok: boolean;
  error?: string;
  left?: { url: string; review: Review };
  right?: { url: string; review: Review };
  scoreDifference?: number;
};

function HealthScoreBreakdown({ review }: { review: Review }) {
  if (!review.performance || !review.websiteHealthScore) {
    return null;
  }

  const { performance, websiteHealthScore } = review;
  const breakdown = [
    { label: "UX", score: review.score, weight: 35, color: "bg-blue-500" },
    { label: "Performance", score: performance.overallPerformanceScore, weight: 30, color: "bg-green-500" },
    { label: "Accessibility", score: review.accessibility.score, weight: 20, color: "bg-purple-500" },
    { label: "SEO", score: review.seo.score, weight: 15, color: "bg-orange-500" },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Website Health Score</h4>
        <div className={`text-2xl font-bold ${getScoreColor(websiteHealthScore)}`}>
          {websiteHealthScore}/100
        </div>
      </div>

      <div className="space-y-2">
        {breakdown.map((item) => (
          <div key={item.label} className="flex items-center gap-3 text-sm">
            <div className="w-24 font-medium">{item.label}</div>
            <div className="flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className={`h-2 ${item.color}`}
                style={{ width: `${item.score}%` }}
              />
            </div>
            <div className="w-12 text-right">{item.score}/100</div>
            <div className="w-10 text-xs opacity-60">{item.weight}%</div>
          </div>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">View Performance Metrics</summary>
        <div className="mt-3 space-y-2">
          {performance.performance.metrics.length > 0 ? (
            performance.performance.metrics.map((metric) => (
              <div key={metric.id} className="rounded border border-black/10 p-2 dark:border-white/15">
                <p className="font-medium">{metric.title}</p>
                <p className="text-xs opacity-70">{metric.displayValue}</p>
              </div>
            ))
          ) : (
            <p className="text-xs opacity-60 italic">Performance metrics not available. PageSpeed API may have failed.</p>
          )}
        </div>
      </details>
    </div>
  );
}

type ScoreHistoryItem = {
  id: string;
  url: string;
  score: number;
  websiteHealthScore: number | null;
  createdAt: string;
};

function ScoreTrend({ url }: { url: string }) {
  const [history, setHistory] = useState<ScoreHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const encodedUrl = encodeURIComponent(url);
        const response = await fetch(`/api/history/${encodedUrl}?limit=30`);
        const data = await response.json();
        if (data.ok) {
          setHistory(data.history);
        }
      } catch (error) {
        console.error("Failed to fetch history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [url]);

  if (loading) {
    return (
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h4 className="mb-3 font-semibold">Score Trend (Last 30)</h4>
        <p className="text-sm opacity-60">Loading...</p>
      </div>
    );
  }

  if (history.length < 2) {
    return (
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h4 className="mb-3 font-semibold">Score Trend</h4>
        <p className="text-sm opacity-60">Run more audits to see trends</p>
      </div>
    );
  }

  const maxScore = 100;
  const reversedHistory = [...history].reverse();

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h4 className="mb-3 font-semibold">Score Trend (Last {history.length})</h4>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>UX Score</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Health Score</span>
          </div>
        </div>
        <div className="flex items-end gap-1 h-32">
          {reversedHistory.map((item) => {
            const uxHeight = (item.score / maxScore) * 100;
            const healthHeight = item.websiteHealthScore
              ? (item.websiteHealthScore / maxScore) * 100
              : 0;

            return (
              <div
                key={item.id}
                className="flex-1 flex h-full flex-col items-center gap-1 group"
                title={`Date: ${new Date(item.createdAt).toLocaleDateString()}\nUX: ${item.score}/100\nHealth: ${item.websiteHealthScore ?? "N/A"}/100`}
              >
                <div className="flex h-24 w-full items-end gap-0.5">
                  <div
                    className="flex-1 rounded-t bg-blue-500 opacity-80"
                    style={{ height: `${uxHeight}%` }}
                  />
                  <div
                    className="flex-1 rounded-t bg-green-500 opacity-80"
                    style={{ height: `${healthHeight}%` }}
                  />
                </div>
                <span className="text-[10px] opacity-60">
                  {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ label, review, url }: { label: string; review: Review; url: string }) {
  const groupedIssues = useMemo(() => {
    return review.issues.reduce<Record<string, Issue[]>>((acc, issue) => {
      if (!acc[issue.category]) {
        acc[issue.category] = [];
      }
      acc[issue.category].push(issue);
      return acc;
    }, {});
  }, [review.issues]);

  return (
    <section className="space-y-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{label}</h3>
        <div className="rounded-full border border-black/10 px-3 py-1 text-sm font-semibold dark:border-white/15">
          Score: {review.score}/100
        </div>
      </div>
      <p className="text-sm break-all opacity-80">{url}</p>

      {review.screenshots && (
        <div className="mt-4 space-y-3">
          <h4 className="mb-2 font-semibold">Screenshots</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide opacity-70">Above the Fold</p>
              <img src={review.screenshots.aboveTheFold} alt="Above the fold screenshot" className="w-full rounded border border-black/10 dark:border-white/15" />
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide opacity-70">Mobile</p>
              <img src={review.screenshots.mobile} alt="Mobile screenshot" className="w-full rounded border border-black/10 dark:border-white/15" />
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide opacity-70">Full Page</p>
              <img src={review.screenshots.fullPage} alt="Full page screenshot" className="w-full rounded border border-black/10 dark:border-white/15" />
            </div>
          </div>
        </div>
      )}

      <HealthScoreBreakdown review={review} />

      <div>
        <h4 className="mb-2 font-semibold">Issues</h4>
        <div className="space-y-4">
          {Object.entries(groupedIssues).map(([category, issues]) => (
            <div key={category}>
              <p className="mb-1 text-sm font-medium capitalize">{category}</p>
              <ul className="space-y-2">
                {issues.map((issue, index) => (
                  <li key={`${category}-${index}`} className="rounded-md border border-black/10 p-3 text-sm dark:border-white/15">
                    <p className="font-semibold">{issue.title}</p>
                    <p className="mt-1 opacity-90">{issue.why}</p>
                    <p className="mt-1 opacity-70">Evidence: “{issue.evidence}”</p>
                    <p className="mt-1 text-xs uppercase tracking-wide opacity-70">Severity: {issue.severity}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 font-semibold">Top Improvements</h4>
        <ul className="space-y-2 text-sm">
          {review.top_improvements.slice(0, 3).map((item, index) => (
            <li key={`${item.before}-${index}`} className="rounded-md border border-black/10 p-3 dark:border-white/15">
              <p className="font-medium">Before: {item.before}</p>
              <p className="mt-1">After: {item.after}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Home() {
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [url, setUrl] = useState("");
  const [leftUrl, setLeftUrl] = useState("");
  const [rightUrl, setRightUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [singleResult, setSingleResult] = useState<AnalyzeResponse | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);

  async function analyzeSingle() {
    setLoading(true);
    setError("");
    setCompareResult(null);
    setSingleResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = (await response.json()) as AnalyzeResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Analysis failed.");
      }

      setSingleResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeCompare() {
    setLoading(true);
    setError("");
    setSingleResult(null);
    setCompareResult(null);

    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leftUrl, rightUrl }),
      });

      const data = (await response.json()) as CompareResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Comparison failed.");
      }

      setCompareResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">AI UX Audit</h2>
        <p className="text-sm opacity-80">Paste a URL for a UX review, or compare two URLs side-by-side.</p>
      </section>

      <section className="space-y-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${
              mode === "single" ? "border-black/30" : "border-black/10"
            } dark:border-white/30`}
            onClick={() => setMode("single")}
          >
            Single URL
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${
              mode === "compare" ? "border-black/30" : "border-black/10"
            } dark:border-white/30`}
            onClick={() => setMode("compare")}
          >
            Compare 2 URLs
          </button>
        </div>

        {mode === "single" ? (
          <div className="space-y-3">
            <label htmlFor="url" className="block text-sm font-medium">
              Website URL
            </label>
            <input
              id="url"
              type="text"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="w-full rounded-md border border-black/15 bg-transparent p-2 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20"
              placeholder="https://example.com"
            />
            <button
              type="button"
              onClick={analyzeSingle}
              disabled={loading}
              className="rounded-md border border-black/20 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/25"
            >
              {loading ? "Analyzing..." : "Analyze"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="leftUrl" className="mb-1 block text-sm font-medium">
                Left URL
              </label>
              <input
                id="leftUrl"
                type="text"
                value={leftUrl}
                onChange={(event) => setLeftUrl(event.target.value)}
                className="w-full rounded-md border border-black/15 bg-transparent p-2 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20"
                placeholder="https://site-a.com"
              />
            </div>
            <div>
              <label htmlFor="rightUrl" className="mb-1 block text-sm font-medium">
                Right URL
              </label>
              <input
                id="rightUrl"
                type="text"
                value={rightUrl}
                onChange={(event) => setRightUrl(event.target.value)}
                className="w-full rounded-md border border-black/15 bg-transparent p-2 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20"
                placeholder="https://site-b.com"
              />
            </div>
            <button
              type="button"
              onClick={analyzeCompare}
              disabled={loading}
              className="rounded-md border border-black/20 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/25"
            >
              {loading ? "Comparing..." : "Compare"}
            </button>
          </div>
        )}

        {error ? <p className="text-sm text-red-500">{error}</p> : null}
      </section>

      {singleResult?.review && singleResult.url ? (
        <>
          <ReviewCard label="Review Result" review={singleResult.review} url={singleResult.url} />
          <ScoreTrend url={singleResult.url} />
        </>
      ) : null}

      {compareResult?.left && compareResult?.right ? (
        <section className="space-y-4">
          <div className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
            Score difference (Right - Left): <span className="font-semibold">{compareResult.scoreDifference ?? 0}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ReviewCard label="Left Site" review={compareResult.left.review} url={compareResult.left.url} />
            <ReviewCard label="Right Site" review={compareResult.right.review} url={compareResult.right.url} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
