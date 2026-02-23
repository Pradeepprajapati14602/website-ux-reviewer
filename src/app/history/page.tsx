import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type StoredReview = {
  score?: number;
  issues?: unknown[];
  visual?: {
    fullPage: string;
    aboveTheFold: string;
    mobile: string;
  };
  websiteHealthScore?: number;
};

type ReviewRow = Awaited<ReturnType<typeof prisma.review.findMany>>[number];

export default async function HistoryPage() {
  const reviews: ReviewRow[] | null = await prisma.review
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
          {reviews.map((review: ReviewRow) => {
            const parsed = (review.result || {}) as StoredReview;
            const issueCount = Array.isArray(parsed.issues) ? parsed.issues.length : 0;
            const visualAssets = {
              fullPage: review.visualFullPage || parsed.visual?.fullPage || "",
              aboveTheFold: review.visualAboveFold || parsed.visual?.aboveTheFold || "",
              mobile: review.visualMobile || parsed.visual?.mobile || "",
            };

            return (
              <li key={review.id} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
                <p className="text-sm break-all opacity-90">{review.url}</p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span className="font-medium">UX Score: {parsed.score ?? review.score}/100</span>
                  {review.websiteHealthScore !== null && review.websiteHealthScore !== undefined && (
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      Health: {review.websiteHealthScore}/100
                    </span>
                  )}
                  <span>Issues: {issueCount}</span>
                  <span>{new Date(review.createdAt).toLocaleString()}</span>
                </div>
                {visualAssets.aboveTheFold && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium">View Screenshots</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      {visualAssets.aboveTheFold && (
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-wide opacity-70">Above the Fold</p>
                          <img src={visualAssets.aboveTheFold} alt="Above the fold screenshot" className="w-full rounded border border-black/10 dark:border-white/15" />
                        </div>
                      )}
                      {visualAssets.mobile && (
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-wide opacity-70">Mobile</p>
                          <img src={visualAssets.mobile} alt="Mobile screenshot" className="w-full rounded border border-black/10 dark:border-white/15" />
                        </div>
                      )}
                      {visualAssets.fullPage && (
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-wide opacity-70">Full Page</p>
                          <img src={visualAssets.fullPage} alt="Full page screenshot" className="w-full rounded border border-black/10 dark:border-white/15" />
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}