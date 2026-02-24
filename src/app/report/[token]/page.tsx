import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPublicReportToken } from "@/lib/share-report";

type PublicIssue = {
  title: string;
  why: string;
  severity: string;
  confidence?: string;
  priorityLabel?: string;
};

type PublicReviewResult = {
  score?: number;
  websiteHealthScore?: number;
  issues?: PublicIssue[];
  top_improvements?: Array<{ before: string; after: string }>;
  accessibility?: { score?: number };
  seo?: { score?: number };
  visual?: { score?: number };
};

export const dynamic = "force-dynamic";

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  let payload: { reviewId: string; expiresAt: number } | null = null;

  try {
    const { token } = await params;
    payload = verifyPublicReportToken(decodeURIComponent(token));
  } catch {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Public report unavailable</h1>
        <p className="text-sm text-red-500">This link is invalid or has expired.</p>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Public report unavailable</h1>
        <p className="text-sm text-red-500">This link is invalid or has expired.</p>
      </main>
    );
  }

  const review = await prisma.review.findUnique({
    where: { id: payload.reviewId },
    select: {
      url: true,
      score: true,
      websiteHealthScore: true,
      result: true,
      createdAt: true,
    },
  });

  if (!review) {
    notFound();
  }

  const result = (review.result || {}) as PublicReviewResult;
  const issues = Array.isArray(result.issues) ? result.issues : [];

  return (
    <main className="space-y-6">
      <section className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h1 className="text-2xl font-semibold">Public UX Audit Report</h1>
        <p className="text-sm break-all opacity-80">{review.url}</p>
        <p className="text-xs opacity-60">Generated: {new Date(review.createdAt).toLocaleString()}</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
          <p className="text-sm opacity-70">UX Score</p>
          <p className="text-3xl font-bold">{result.score ?? review.score}/100</p>
        </div>
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
          <p className="text-sm opacity-70">Website Health</p>
          <p className="text-3xl font-bold">{review.websiteHealthScore ?? "N/A"}</p>
        </div>
      </section>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="mb-3 text-lg font-semibold">Top Findings</h2>
        {issues.length === 0 ? (
          <p className="text-sm opacity-70">No findings available.</p>
        ) : (
          <ul className="space-y-2">
            {issues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.title}-${index}`} className="rounded border border-black/10 p-3 text-sm dark:border-white/15">
                <p className="font-semibold">{issue.title}</p>
                <p className="opacity-80">{issue.why}</p>
                <p className="mt-1 text-xs opacity-70">
                  Severity: {issue.severity} · Confidence: {issue.confidence ?? "N/A"} · Priority: {issue.priorityLabel ?? "N/A"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
