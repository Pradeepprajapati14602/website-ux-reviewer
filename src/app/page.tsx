"use client";

import { useMemo, useState } from "react";

type Issue = {
  category: "clarity" | "layout" | "navigation" | "accessibility" | "trust";
  title: string;
  why: string;
  evidence: string;
  severity: "low" | "medium" | "high";
};

type Review = {
  score: number;
  issues: Issue[];
  top_improvements: Array<{ before: string; after: string }>;
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
        <ReviewCard label="Review Result" review={singleResult.review} url={singleResult.url} />
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
