-- CreateTable
CREATE TABLE "SearchLog" (
    "id" SERIAL NOT NULL,
    "term" VARCHAR(120) NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_view_daily" (
    "article_id" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "article_view_daily_pkey" PRIMARY KEY ("article_id", "day"),
    CONSTRAINT "article_view_daily_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("article_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");

-- CreateIndex
CREATE INDEX "SearchLog_term_idx" ON "SearchLog"("term");
