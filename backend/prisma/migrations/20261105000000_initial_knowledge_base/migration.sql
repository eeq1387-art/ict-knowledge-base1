CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');

CREATE TABLE "admins" (
    "admin_id" SERIAL NOT NULL,
    "username" VARCHAR(80) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "fullname" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admins_pkey" PRIMARY KEY ("admin_id")
);

CREATE TABLE "categories" (
    "category_id" SERIAL NOT NULL,
    "category_name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("category_id")
);

CREATE TABLE "articles" (
    "article_id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "content" TEXT NOT NULL,
    "steps" JSONB,
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "image" VARCHAR(1024),
    "pdf_file" VARCHAR(1024),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "articles_pkey" PRIMARY KEY ("article_id")
);

CREATE TABLE "article_feedback" (
    "feedback_id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "voter_key" CHAR(64) NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_feedback_pkey" PRIMARY KEY ("feedback_id")
);

CREATE UNIQUE INDEX "admins_username_key" ON "admins"("username");
CREATE UNIQUE INDEX "categories_category_name_key" ON "categories"("category_name");
CREATE INDEX "articles_category_id_status_idx" ON "articles"("category_id", "status");
CREATE INDEX "articles_status_published_at_idx" ON "articles"("status", "published_at");
CREATE UNIQUE INDEX "article_feedback_article_id_voter_key_key" ON "article_feedback"("article_id", "voter_key");

ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_feedback" ADD CONSTRAINT "article_feedback_article_id_fkey"
  FOREIGN KEY ("article_id") REFERENCES "articles"("article_id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "categories" ("category_name", "description") VALUES
  ('คอมพิวเตอร์และอุปกรณ์', 'การใช้งานและแก้ไขปัญหาคอมพิวเตอร์และอุปกรณ์'),
  ('ระบบเครือข่ายและอินเทอร์เน็ต', 'เครือข่าย การเชื่อมต่อ และอินเทอร์เน็ต'),
  ('โปรแกรมและซอฟต์แวร์', 'การติดตั้งและใช้งานโปรแกรม'),
  ('เครื่องพิมพ์และอุปกรณ์ต่อพ่วง', 'เครื่องพิมพ์และอุปกรณ์ต่อพ่วง'),
  ('ระบบสารสนเทศและบริการออนไลน์', 'ระบบสารสนเทศและบริการออนไลน์ของหน่วยงาน');
