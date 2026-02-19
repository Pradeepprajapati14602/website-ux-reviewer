import { Prisma } from "@prisma/client";
import { runUxAudit, type UXReview } from "@/lib/analysis";
import { extractWebsiteContent } from "@/lib/extractor";
import { prisma } from "@/lib/prisma";

const MAX_HISTORY = 5;

async function keepLastFiveReviews(): Promise<void> {
  const oldReviews = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    skip: MAX_HISTORY,
    select: { id: true },
  });

  if (!oldReviews.length) {
    return;
  }

  await prisma.review.deleteMany({
    where: {
      id: {
        in: oldReviews.map((review) => review.id),
      },
    },
  });
}

export async function analyzeAndSave(url: string): Promise<UXReview> {
  const extracted = await extractWebsiteContent(url);
  const review = await runUxAudit(extracted.payload);

  await prisma.review.create({
    data: {
      url,
      score: review.score,
      result: review as Prisma.InputJsonValue,
    },
  });

  await keepLastFiveReviews();

  return review;
}