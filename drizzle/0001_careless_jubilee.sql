ALTER TABLE "generations" ADD COLUMN "markdown" text;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "published_generation_id" uuid;