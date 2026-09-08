ALTER TABLE "users" ADD COLUMN "dodo_subscription_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dodo_subscription_status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dodo_grace_until" timestamp;