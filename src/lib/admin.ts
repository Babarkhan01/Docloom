import { sql } from "drizzle-orm";
import { db } from "./db";
import { generations, repos, users } from "./schema";
import { effectivePlan, type Plan } from "./billing";
import { adminLogins } from "./env";

// ---------------------------------------------------------------------------
// Internal admin dashboard data. Read-only aggregates over users / repos /
// generations — no new tables, no writes.
// ---------------------------------------------------------------------------

/**
 * Admin access is an env allowlist (`ADMIN_GITHUB_LOGINS`), not a DB column:
 * the schema has no roles table and adding one for a single internal page
 * would be overkill. Deny-by-default — an empty allowlist makes nobody admin.
 */
export function isAdmin(user: { login: string }): boolean {
  const allowed = adminLogins();
  if (allowed.length === 0) return false;
  return allowed.includes(user.login.toLowerCase());
}

/** Window for the per-day charts. Totals are all-time. */
export const ADMIN_WINDOW_DAYS = 30;

export type DayPoint = { day: string; count: number };

export type AdminStats = {
  totals: {
    signups: number;
    signups7d: number;
    repos: number;
    reposActive: number;
    reposHosted: number;
    generations: number;
    generations7d: number;
    generationsFailed: number;
    tokensUsed: number;
  };
  signupsByDay: DayPoint[];
  generationsByDay: DayPoint[];
  planBreakdown: { plan: Plan; count: number }[];
};

/** UTC midnight `days - 1` days ago — the first bucket of the window. */
function windowStart(days: number): Date {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

/**
 * The same instant, computed by Postgres: UTC midnight today minus `days - 1`.
 * `at time zone 'UTC'` matters — a bare `date_trunc('day', now())` truncates in
 * the session's timezone, which would silently shift every bucket boundary.
 * Comparing timestamp-to-timestamp also keeps the driver out of date handling.
 */
function sinceExpr(days: number) {
  return sql`(date_trunc('day', (now() at time zone 'UTC')) - make_interval(days => ${days - 1}))`;
}

/**
 * Dense series: every day in the window gets a point (gaps become 0) so the
 * chart's x-axis is evenly spaced instead of collapsing quiet days together.
 */
function fillDays(rows: DayPoint[], days: number): DayPoint[] {
  const counts = new Map(rows.map((r) => [r.day, Number(r.count)]));
  const start = windowStart(days);
  const out: DayPoint[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    out.push({ day: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

function sumLast(points: DayPoint[], days: number): number {
  return points.slice(-days).reduce((total, p) => total + p.count, 0);
}

export async function loadAdminStats(): Promise<AdminStats> {
  const since = sinceExpr(ADMIN_WINDOW_DAYS);

  // Bucket in Postgres (`to_char` → text) rather than in JS: casting to `date`
  // would hand the driver a Date, and its local-timezone rendering can shift a
  // row across the bucket boundary.
  const signupDay = sql<string>`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`;
  const generatedAt = sql`coalesce(${generations.startedAt}, ${generations.completedAt})`;
  const generationDay = sql<string>`to_char(date_trunc('day', ${generatedAt}), 'YYYY-MM-DD')`;

  const [userPlans, signupRows, repoCounts, genCounts, genDayRows] = await Promise.all([
    // One small row per user, so the plan tally runs through effectivePlan()
    // (billing.ts) and matches the plan a user actually sees. Re-deriving the
    // grace-window rules in SQL would be faster but would drift from the
    // authoritative seam — worth trading for at admin-table scale.
    db
      .select({
        plan: users.plan,
        dodoSubscriptionStatus: users.dodoSubscriptionStatus,
        dodoGraceUntil: users.dodoGraceUntil,
      })
      .from(users),

    db
      .select({ day: signupDay, count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.createdAt} >= ${since}`)
      .groupBy(signupDay)
      .orderBy(signupDay),

    // Filtered aggregates: one round trip answers all three repo questions.
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`(count(*) filter (where ${repos.status} = 'active'))::int`,
        hosted: sql<number>`(count(*) filter (where ${repos.publishedGenerationId} is not null))::int`,
      })
      .from(repos),

    db
      .select({
        total: sql<number>`count(*)::int`,
        failed: sql<number>`(count(*) filter (where ${generations.status} = 'failed'))::int`,
        tokens: sql<number>`coalesce(sum(${generations.tokensUsed}), 0)::int`,
      })
      .from(generations),

    // Rows with neither timestamp can't be placed on a day and are skipped;
    // in practice every run sets started_at at insert (lib/generation.ts).
    db
      .select({ day: generationDay, count: sql<number>`count(*)::int` })
      .from(generations)
      .where(sql`${generatedAt} >= ${since}`)
      .groupBy(generationDay)
      .orderBy(generationDay),
  ]);

  const signupsByDay = fillDays(signupRows, ADMIN_WINDOW_DAYS);
  const generationsByDay = fillDays(genDayRows, ADMIN_WINDOW_DAYS);

  const planCounts = new Map<Plan, number>();
  for (const u of userPlans) {
    const plan = effectivePlan(u);
    planCounts.set(plan, (planCounts.get(plan) ?? 0) + 1);
  }

  return {
    totals: {
      signups: userPlans.length,
      signups7d: sumLast(signupsByDay, 7),
      repos: repoCounts[0]?.total ?? 0,
      reposActive: repoCounts[0]?.active ?? 0,
      reposHosted: repoCounts[0]?.hosted ?? 0,
      generations: genCounts[0]?.total ?? 0,
      generations7d: sumLast(generationsByDay, 7),
      generationsFailed: genCounts[0]?.failed ?? 0,
      tokensUsed: genCounts[0]?.tokens ?? 0,
    },
    signupsByDay,
    generationsByDay,
    planBreakdown: (["free", "starter", "team"] as const).map((plan) => ({
      plan,
      count: planCounts.get(plan) ?? 0,
    })),
  };
}
