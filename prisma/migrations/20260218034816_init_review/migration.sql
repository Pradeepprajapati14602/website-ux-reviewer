-- CreateTable
CREATE TABLE "public"."Review" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);
