import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type StoredReview = {
  score?: number;
  issues?: unknown[];
};

export default async function HistoryPage() {
  const reviews = await prisma.review
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    })
    .catch(() => null);

  if (reviews === null) {
    return (
      <main className="space-y-4">
        <h2 className="text-2xl font-semibold">Last 5 Reviews</h2>
        <p className="text-sm text-red-500">Database unavailable. Check the status page.</p>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <h2 className="text-2xl font-semibold">Last 5 Reviews</h2>
      {reviews.length === 0 ? (
        <p className="text-sm opacity-80">No reviews yet. Run an analysis from Home.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => {
            const parsed = (review.result || {}) as StoredReview;
            const issueCount = Array.isArray(parsed.issues) ? parsed.issues.length : 0;

            return (
              <li key={review.id} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
                <p className="text-sm break-all opacity-90">{review.url}</p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span className="font-medium">Score: {parsed.score ?? review.score}/100</span>
                  <span>Issues: {issueCount}</span>
                  <span>{new Date(review.createdAt).toLocaleString()}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}