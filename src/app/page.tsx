"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Issue = {
  category: "clarity" | "layout" | "navigation" | "accessibility" | "trust";
  title: string;
  why: string;
  evidence: string;
  severity: "low" | "medium" | "high";
  confidence?: "high" | "medium" | "low";
  evidenceWeight?: number;
  sourceType?: "deterministic" | "heuristic" | "ai_inferred";
  impactScore?: number;
  effortScore?: number;
  priorityScore?: number;
  priorityLabel?: "critical" | "high" | "medium" | "low" | "quick_win";
  fixSnippet?: string;
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

type AuditDiff = {
  scoreDelta: number;
  healthDelta: number | null;
  accessibilityDelta: number;
  seoDelta: number;
  visualDelta: number;
  previousIssueCount: number;
  currentIssueCount: number;
  newIssues: string[];
  resolvedIssues: string[];
  metricHighlights: Array<{
    metric: string;
    before: string;
    after: string;
    status: "improved" | "regressed" | "stable";
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
  diff?: AuditDiff | null;
  motion_analysis?: {
    animation_count: number;
    animations_detected: number;
    types: Array<"css" | "js" | "scroll" | "carousel" | "lottie" | "video">;
    infinite_animations: number;
    auto_carousels: number;
    scroll_reveal_elements: number;
    long_duration_animations: number;
    accessibility_support: boolean;
    reduced_motion_css_present: boolean;
    pause_control_present: boolean;
    flashing_risk: boolean;
    lcp_element_likely_animated: boolean;
    potential_risks: string[];
    performance_correlation: string[];
    risk_score: number;
  };
  ux_intelligence?: {
    cognitive_load: {
      cta_count_above_fold: number;
      primary_cta_conflict: boolean;
      competing_color_count: number;
      overcrowded_hero: boolean;
      risk: string;
      cognitive_load_index: number;
    };
    visual_hierarchy: {
      h1_dominance_ratio: number;
      cta_visual_dominance_ratio: number;
      color_hierarchy_score: number;
      visual_dominance_ratio: number;
      score: number;
    };
    flow_analysis: {
      estimated_pattern: "f-pattern" | "z-pattern" | "mixed";
      reading_flow_score: number;
      reading_order_issues: number;
      cta_scan_risk: boolean;
    };
    cta_quality: {
      vague_cta_count: number;
      benefit_cta_count: number;
      urgency_cta_count: number;
      cta_strength_score: number;
      findings: string[];
    };
    conversion_friction: {
      max_form_fields: number;
      form_fields_over_8: boolean;
      requires_phone_and_email: boolean;
      missing_progress_indicator: boolean;
      trust_badge_missing_on_checkout: boolean;
      conversion_friction_score: number;
      findings: string[];
    };
    trust_signals: {
      testimonials_present: boolean;
      social_proof_present: boolean;
      security_badges_present: boolean;
      about_or_contact_visible: boolean;
      trust_score: number;
    };
    experience_quality: {
      microinteraction_score: number;
      cta_visibility_score: number;
      navigation_simplicity_score: number;
      findings: string[];
    };
    first_impression_score: number;
    ux_risk_radar: {
      clarity: number;
      conversion: number;
      trust: number;
      content: number;
      interaction: number;
      navigation: number;
    };
    risk_level: "Low" | "Medium" | "High";
    findings: string[];
  };
  seo_content_analysis?: {
    word_count: number;
    sentence_count: number;
    avg_sentence_length: number;
    readability_score: number;
    primary_keyword_analysis: {
      keyword: string;
      keyword_count: number;
      density: number;
      recommended_density_range: string;
      placement: {
        in_h1: boolean;
        in_first_100_words: boolean;
        in_meta: boolean;
        subheading_matches: number;
      };
      stuffing_risk: "low" | "medium" | "high";
      repeated_phrase_flags: string[];
    };
    structure_analysis: {
      long_paragraphs: number;
      wall_of_text_paragraphs: number;
      no_subheading_after_300_words: boolean;
      bullet_list_presence: boolean;
      passive_voice_percent: number;
      long_sentence_percent: number;
      complex_sentence_percent: number;
    };
    semantic_coverage_score: number;
    intent_alignment_score: number;
    findings: string[];
  };
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

type ShareLinkResponse = {
  ok: boolean;
  error?: string;
  publicUrl?: string;
  expiresAt?: string;
};

function deltaClass(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "text-xs opacity-60";
  }

  if (value > 0) {
    return "text-xs text-green-600 dark:text-green-400";
  }

  if (value < 0) {
    return "text-xs text-red-600 dark:text-red-400";
  }

  return "text-xs opacity-60";
}

function HealthScoreBreakdown({ review }: { review: Review }) {
  if (!review.performance || !review.websiteHealthScore) {
    return null;
  }

  const { performance, websiteHealthScore } = review;
  const breakdown = review.motion_analysis
    ? [
        { label: "UX", score: review.score, weight: 33, color: "bg-blue-500" },
        { label: "Performance", score: performance.overallPerformanceScore, weight: 28, color: "bg-green-500" },
        { label: "Accessibility", score: review.accessibility.score, weight: 18, color: "bg-purple-500" },
        { label: "SEO", score: review.seo.score, weight: 13, color: "bg-orange-500" },
        { label: "Motion", score: Math.max(0, 100 - review.motion_analysis.risk_score), weight: 8, color: "bg-cyan-500" },
      ]
    : [
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
        <div className={`text-2xl font-bold ${getScoreColor(websiteHealthScore)}`}>{websiteHealthScore}/100</div>
      </div>

      <div className="space-y-2">
        {breakdown.map((item) => (
          <div key={item.label} className="flex items-center gap-3 text-sm">
            <div className="w-24 font-medium">{item.label}</div>
            <div className="flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className={`h-2 ${item.color}`} style={{ width: `${item.score}%` }} />
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
            <div className="h-3 w-3 rounded-full bg-blue-500"></div>
            <span>UX Score</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
            <span>Health Score</span>
          </div>
        </div>
        <div className="flex h-32 items-end gap-1">
          {reversedHistory.map((item) => {
            const uxHeight = (item.score / maxScore) * 100;
            const healthHeight = item.websiteHealthScore ? (item.websiteHealthScore / maxScore) * 100 : 0;

            return (
              <div
                key={item.id}
                className="group flex h-full flex-1 flex-col items-center gap-1"
                title={`Date: ${new Date(item.createdAt).toLocaleDateString()}\nUX: ${item.score}/100\nHealth: ${item.websiteHealthScore ?? "N/A"}/100`}
              >
                <div className="flex h-24 w-full items-end gap-0.5">
                  <div className="flex-1 rounded-t bg-blue-500 opacity-80" style={{ height: `${uxHeight}%` }} />
                  <div className="flex-1 rounded-t bg-green-500 opacity-80" style={{ height: `${healthHeight}%` }} />
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

function AuditDiffCard({ diff }: { diff: AuditDiff }) {
  return (
    <section className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h3 className="text-lg font-semibold">Audit Diff (Previous vs Current)</h3>
      <div className="grid gap-2 md:grid-cols-2">
        <p className={deltaClass(diff.scoreDelta)}>UX Score: {diff.scoreDelta >= 0 ? "+" : ""}{diff.scoreDelta}</p>
        <p className={deltaClass(diff.healthDelta)}>
          Health Score: {diff.healthDelta === null ? "N/A" : `${diff.healthDelta >= 0 ? "+" : ""}${diff.healthDelta}`}
        </p>
        <p className={deltaClass(diff.accessibilityDelta)}>Accessibility: {diff.accessibilityDelta >= 0 ? "+" : ""}{diff.accessibilityDelta}</p>
        <p className={deltaClass(diff.seoDelta)}>SEO: {diff.seoDelta >= 0 ? "+" : ""}{diff.seoDelta}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-black/10 p-3 text-sm dark:border-white/15">
          <p className="font-medium">New issues: {diff.newIssues.length}</p>
          <ul className="mt-1 list-disc pl-4 opacity-80">
            {diff.newIssues.slice(0, 4).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-black/10 p-3 text-sm dark:border-white/15">
          <p className="font-medium">Resolved issues: {diff.resolvedIssues.length}</p>
          <ul className="mt-1 list-disc pl-4 opacity-80">
            {diff.resolvedIssues.slice(0, 4).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {diff.metricHighlights.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Improved metrics highlight</p>
          {diff.metricHighlights.map((metric) => (
            <p key={metric.metric} className={deltaClass(metric.status === "improved" ? 1 : metric.status === "regressed" ? -1 : 0)}>
              {metric.metric}: {metric.before} → {metric.after}
            </p>
          ))}
        </div>
      )}
    </section>
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
        <div className="rounded-full border border-black/10 px-3 py-1 text-sm font-semibold dark:border-white/15">Score: {review.score}/100</div>
      </div>
      <p className="text-sm break-all opacity-80">{url}</p>

      {review.screenshots && (
        <div className="mt-4 space-y-3">
          <h4 className="mb-2 font-semibold">Screenshots</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide opacity-70">Above the Fold</p>
              <Image src={review.screenshots.aboveTheFold} alt="Above the fold screenshot" width={1200} height={675} unoptimized className="h-auto w-full rounded border border-black/10 dark:border-white/15" />
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide opacity-70">Mobile</p>
              <Image src={review.screenshots.mobile} alt="Mobile screenshot" width={1200} height={675} unoptimized className="h-auto w-full rounded border border-black/10 dark:border-white/15" />
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide opacity-70">Full Page</p>
              <Image src={review.screenshots.fullPage} alt="Full page screenshot" width={1200} height={675} unoptimized className="h-auto w-full rounded border border-black/10 dark:border-white/15" />
            </div>
          </div>
        </div>
      )}

      <HealthScoreBreakdown review={review} />

      {review.seo_content_analysis ? (
        <div className="space-y-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
          <h4 className="font-semibold">Content Intelligence</h4>
          <p className="opacity-80">
            Words: {review.seo_content_analysis.word_count} · Sentences: {review.seo_content_analysis.sentence_count} · Avg sentence: {review.seo_content_analysis.avg_sentence_length}
          </p>
          <p className="opacity-80">
            Readability: {review.seo_content_analysis.readability_score} · Intent alignment: {review.seo_content_analysis.intent_alignment_score} · Semantic depth: {review.seo_content_analysis.semantic_coverage_score}
          </p>
          <p className="opacity-80">
            Primary keyword: “{review.seo_content_analysis.primary_keyword_analysis.keyword || "N/A"}” · Density: {review.seo_content_analysis.primary_keyword_analysis.density}% ({review.seo_content_analysis.primary_keyword_analysis.recommended_density_range})
          </p>
          <p className="text-xs opacity-70">
            H1: {review.seo_content_analysis.primary_keyword_analysis.placement.in_h1 ? "✔" : "✖"} · First 100 words: {review.seo_content_analysis.primary_keyword_analysis.placement.in_first_100_words ? "✔" : "✖"} · Meta: {review.seo_content_analysis.primary_keyword_analysis.placement.in_meta ? "✔" : "✖"} · Subheadings: {review.seo_content_analysis.primary_keyword_analysis.placement.subheading_matches}
          </p>
          {review.seo_content_analysis.findings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-xs opacity-80">
              {review.seo_content_analysis.findings.slice(0, 4).map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {review.motion_analysis ? (
        <div className="space-y-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
          <h4 className="font-semibold">Motion Analysis</h4>
          <p className="opacity-80">
            Animations: {review.motion_analysis.animation_count} · Infinite: {review.motion_analysis.infinite_animations} · Auto carousels: {review.motion_analysis.auto_carousels}
          </p>
          <p className="opacity-80">
            Types: {review.motion_analysis.types.join(", ") || "none"} · Reduced-motion CSS: {review.motion_analysis.reduced_motion_css_present ? "✔" : "✖"} · Pause control: {review.motion_analysis.pause_control_present ? "✔" : "✖"}
          </p>
          <p className="opacity-80">
            LCP animated candidate: {review.motion_analysis.lcp_element_likely_animated ? "Yes" : "No"} · Risk score: {review.motion_analysis.risk_score}/100
          </p>
          {review.motion_analysis.potential_risks.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-xs opacity-80">
              {review.motion_analysis.potential_risks.slice(0, 4).map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          ) : null}
          {review.motion_analysis.performance_correlation.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-xs opacity-80">
              {review.motion_analysis.performance_correlation.slice(0, 2).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {review.ux_intelligence ? (
        <div className="space-y-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
          <h4 className="font-semibold">UX Intelligence</h4>
          <p className="opacity-80">
            First impression: {review.ux_intelligence.first_impression_score}/100 · Risk: {review.ux_intelligence.risk_level} · Cognitive load: {review.ux_intelligence.cognitive_load.cognitive_load_index}/100
          </p>
          <p className="opacity-80">
            CTA strength: {review.ux_intelligence.cta_quality.cta_strength_score} · Friction: {review.ux_intelligence.conversion_friction.conversion_friction_score} · Trust: {review.ux_intelligence.trust_signals.trust_score}
          </p>
          <p className="opacity-80">
            CTA above fold: {review.ux_intelligence.cognitive_load.cta_count_above_fold} · Primary conflict: {review.ux_intelligence.cognitive_load.primary_cta_conflict ? "Yes" : "No"} · Color variants: {review.ux_intelligence.cognitive_load.competing_color_count}
          </p>
          <p className="text-xs opacity-70">
            Microinteraction: {review.ux_intelligence.experience_quality.microinteraction_score} · CTA visibility: {review.ux_intelligence.experience_quality.cta_visibility_score} · Nav simplicity: {review.ux_intelligence.experience_quality.navigation_simplicity_score}
          </p>
          <p className="text-xs opacity-70">
            Radar → Clarity {review.ux_intelligence.ux_risk_radar.clarity} · Conversion {review.ux_intelligence.ux_risk_radar.conversion} · Trust {review.ux_intelligence.ux_risk_radar.trust} · Interaction {review.ux_intelligence.ux_risk_radar.interaction}
          </p>
          {review.ux_intelligence.findings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-xs opacity-80">
              {review.ux_intelligence.findings.slice(0, 6).map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

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
                    <p className="mt-1 text-xs opacity-70">
                      Confidence: {issue.confidence ?? "medium"} · Source: {issue.sourceType ?? "ai_inferred"} · Evidence: {issue.evidenceWeight ?? "N/A"}
                    </p>
                    <p className="mt-1 text-xs opacity-70">
                      Impact: {issue.impactScore ?? "N/A"} · Effort: {issue.effortScore ?? "N/A"} · Priority: {issue.priorityLabel ?? "medium"} ({issue.priorityScore ?? "N/A"})
                    </p>
                    {issue.fixSnippet ? (
                      <pre className="mt-2 overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/10">{issue.fixSnippet}</pre>
                    ) : null}
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
  const [shareExpiresInHours, setShareExpiresInHours] = useState(72);
  const [publicReportLink, setPublicReportLink] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");

  async function analyzeSingle() {
    setLoading(true);
    setError("");
    setCompareResult(null);
    setSingleResult(null);
    setPublicReportLink("");
    setShareError("");

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

  async function createShareLink() {
    if (!singleResult?.url) {
      return;
    }

    setShareLoading(true);
    setShareError("");

    try {
      const response = await fetch("/api/report/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: singleResult.url,
          expiresInHours: shareExpiresInHours,
        }),
      });

      const data = (await response.json()) as ShareLinkResponse;
      if (!response.ok || !data.ok || !data.publicUrl) {
        throw new Error(data.error || "Failed to create share link.");
      }

      setPublicReportLink(data.publicUrl);
    } catch (requestError) {
      setShareError(requestError instanceof Error ? requestError.message : "Failed to create share link.");
    } finally {
      setShareLoading(false);
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
            className={`rounded-md border px-3 py-2 text-sm ${mode === "single" ? "border-black/30" : "border-black/10"} dark:border-white/30`}
            onClick={() => setMode("single")}
          >
            Single URL
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${mode === "compare" ? "border-black/30" : "border-black/10"} dark:border-white/30`}
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
          {singleResult.review.diff ? <AuditDiffCard diff={singleResult.review.diff} /> : null}
          <section className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
            <h3 className="text-lg font-semibold">Share Public Report</h3>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="expiry" className="opacity-80">
                Expires in
              </label>
              <select
                id="expiry"
                value={shareExpiresInHours}
                onChange={(event) => setShareExpiresInHours(Number(event.target.value))}
                className="rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
              >
                <option value={24}>24h</option>
                <option value={72}>72h</option>
                <option value={168}>7 days</option>
              </select>
              <button
                type="button"
                onClick={createShareLink}
                disabled={shareLoading}
                className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/25"
              >
                {shareLoading ? "Generating..." : "Generate Link"}
              </button>
            </div>
            {publicReportLink ? (
              <a href={publicReportLink} target="_blank" rel="noreferrer" className="block break-all text-sm underline opacity-90">
                {publicReportLink}
              </a>
            ) : null}
            {shareError ? <p className="text-sm text-red-500">{shareError}</p> : null}
          </section>
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
