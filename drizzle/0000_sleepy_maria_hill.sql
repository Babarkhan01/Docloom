CREATE TYPE "public"."generation_status" AS ENUM('queued', 'processing', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."repo_status" AS ENUM('active', 'paused', 'disconnected');--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"status" "generation_status" NOT NULL,
	"tokens_used" integer,
	"triggered_by" text DEFAULT 'manual' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"github_repo_full_name" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"installation_id" bigint NOT NULL,
	"default_branch" text NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"docs_subdomain" text NOT NULL,
	"status" "repo_status" DEFAULT 'active' NOT NULL,
	"error" text,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_generated_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repos_docs_subdomain_unique" UNIQUE("docs_subdomain")
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"user_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"generations_count" integer DEFAULT 0 NOT NULL,
	"tokens_used_total" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_user_id_period_start_pk" PRIMARY KEY("user_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" text NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"email" text,
	"avatar_url" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"dodo_customer_id" text,
	"session_version" integer DEFAULT 0 NOT NULL,
	"github_access_token_encrypted" text NOT NULL,
	"github_refresh_token_encrypted" text,
	"github_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generations_repo_id_idx" ON "generations" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repos_user_full_name_idx" ON "repos" USING btree ("user_id","github_repo_full_name");--> statement-breakpoint
CREATE INDEX "repos_user_id_idx" ON "repos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_github_id_idx" ON "users" USING btree ("github_id");