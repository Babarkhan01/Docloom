ALTER TABLE "repos" ADD COLUMN "auto_regenerate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "last_processed_commit_sha" text;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "last_webhook_at" timestamp;