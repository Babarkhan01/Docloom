import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Tech spec §2 — core tables. Schema mirrors the spec; a few columns are added
// where the MVP needs them (docs subdomain, installation id, refresh token).
// No table stores raw source code — code is fetched, processed in-memory,
// and discarded after generation.
// ---------------------------------------------------------------------------

export const repoStatus = pgEnum("repo_status", ["active", "paused", "disconnected"]);

export const generationStatus = pgEnum("generation_status", [
  "queued",
  "processing",
  "success",
  "failed",
]);

/**
 * A Docloom user. Identity comes exclusively from GitHub OAuth.
 * GitHub tokens are encrypted at rest (AES-256-GCM, lib/crypto.ts) and only
 * used to mint short-lived, read-only installation tokens.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubId: text("github_id").notNull().unique(),
    login: text("login").notNull(),
    name: text("name"),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    plan: text("plan").notNull().default("free"), // free / starter / team
    dodoCustomerId: text("dodo_customer_id"), // Dodo Payments customer reference
    // Bumped on logout so previously issued session tokens are invalidated
    // server-side (tech spec §1).
    sessionVersion: integer("session_version").notNull().default(0),
    // Encrypted with AES-256-GCM (lib/crypto.ts) — never plaintext.
    githubAccessTokenEncrypted: text("github_access_token_encrypted").notNull(),
    githubRefreshTokenEncrypted: text("github_refresh_token_encrypted"),
    githubTokenExpiresAt: timestamp("github_token_expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("users_github_id_idx").on(t.githubId)],
);

/**
 * A repository the user connected. Metadata only — the only source of truth
 * for a repo's GitHub identity is github_repo_full_name.
 */
export const repos = pgTable(
  "repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    githubRepoFullName: text("github_repo_full_name").notNull(), // e.g. "user/repo"
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    // GitHub App installation the repo belongs to — used to mint read-only
    // installation tokens when parsing/generating docs.
    installationId: bigint("installation_id", { mode: "number" }).notNull(),
    defaultBranch: text("default_branch").notNull(),
    isPrivate: boolean("is_private").notNull().default(false),
    // Subdomain where generated docs are hosted (e.g. owner-name.docloom.app)
    docsSubdomain: text("docs_subdomain").notNull().unique(),
    status: repoStatus("status").notNull().default("active"), // active / paused / disconnected
    error: text("error"),
    connectedAt: timestamp("connected_at").notNull().defaultNow(),
    lastGeneratedAt: timestamp("last_generated_at"),
    // Generation row currently published for this repo. Plain uuid (no FK) to
    // avoid a circular reference with generations.repo_id; integrity is
    // enforced in app code and by ON DELETE cascade on generations.
    publishedGenerationId: uuid("published_generation_id"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("repos_user_full_name_idx").on(t.userId, t.githubRepoFullName),
    index("repos_user_id_idx").on(t.userId),
  ],
);

/**
 * One doc-generation run per repo. Also feeds cost tracking (tokens_used).
 * The generated markdown lives on the row (draft until publishedAt is set);
 * repos.published_generation_id points at the row currently shown publicly.
 */
export const generations = pgTable(
  "generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    status: generationStatus("status").notNull(), // queued / processing / success / failed
    tokensUsed: integer("tokens_used"), // cost tracking (tech spec §4)
    triggeredBy: text("triggered_by").notNull().default("manual"), // manual / webhook
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    errorMessage: text("error_message"),
    // Draft markdown produced by the run; null until processing succeeds.
    markdown: text("markdown"),
    // Set when the user approves the draft (diff preview → publish).
    publishedAt: timestamp("published_at"),
  },
  (t) => [index("generations_repo_id_idx").on(t.repoId)],
);

/**
 * Per-user, per-billing-period counters so quota checks are a fast indexed
 * lookup, not an aggregate over `generations` on every request (tech spec §2).
 */
export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(), // billing period start, for quota resets
    generationsCount: integer("generations_count").notNull().default(0),
    tokensUsedTotal: integer("tokens_used_total").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.periodStart] })],
);

export type RepoStatus = (typeof repoStatus.enumValues)[number];
export type GenerationStatus = (typeof generationStatus.enumValues)[number];