import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import {
  ADMIN_WINDOW_DAYS,
  isAdmin,
  loadAdminStats,
  type DayPoint,
} from "@/lib/admin";
import { getAuthorizedUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Internal page — never index it.
export const metadata = {
  title: "Admin · docloom",
  robots: { index: false, follow: false },
};

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100">
        {value.toLocaleString("en-US")}
      </p>
      {hint ? <p className="mt-0.5 font-mono text-[11px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

/** One bar per day; the plot is a flex row so bars stay proportional at any width. */
function BarChart({
  title,
  note,
  points,
  barClassName,
}: {
  title: string;
  note: string;
  points: DayPoint[];
  barClassName: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-sm font-semibold text-zinc-100">{title}</h2>
        <span className="font-mono text-[11px] text-zinc-500">{note}</span>
      </div>
      <div
        className="flex h-28 items-end gap-[3px]"
        role="img"
        aria-label={`${title} — ${note}`}
      >
        {points.map((p) => (
          <div
            key={p.day}
            title={`${p.day} · ${p.count}`}
            style={{ height: `${Math.max(3, Math.round((p.count / max) * 100))}%` }}
            className={`min-w-0 flex-1 rounded-sm ${p.count === 0 ? "bg-zinc-800" : barClassName}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-600">
        <span>{points[0]?.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </section>
  );
}

function PlanBreakdown({ rows, total }: { rows: { plan: string; count: number }[]; total: number }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-sm font-semibold text-zinc-100">Plans</h2>
        <span className="font-mono text-[11px] text-zinc-500">
          effective plan · paid needs a live subscription
        </span>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => {
          const pct = total > 0 ? (r.count / total) * 100 : 0;
          return (
            <li key={r.plan}>
              <div className="mb-1 flex items-baseline justify-between font-mono text-xs">
                <span className="text-zinc-300">{r.plan}</span>
                <span className="text-zinc-500">
                  {r.count} · {pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full ${r.plan === "free" ? "bg-zinc-600" : "bg-accent"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function AdminPage() {
  const authorized = await getAuthorizedUser();
  if (!authorized) redirect("/login");
  // 404 rather than a "not allowed" page: a signed-in non-admin shouldn't even
  // learn the route exists.
  if (!isAdmin(authorized.user)) notFound();

  const stats = await loadAdminStats();
  const { totals } = stats;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Logo label="admin" />
          <p className="mt-2 font-mono text-xs text-zinc-600">
            signed in as <span className="text-zinc-400">{authorized.user.login}</span> · days in UTC
            · all-time totals
          </p>
        </div>
        <Link
          href="/dashboard"
          className="font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          dashboard →
        </Link>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total signups"
          value={totals.signups}
          hint={`+${totals.signups7d} in the last 7 days`}
        />
        <StatCard
          label="Active repos"
          value={totals.reposActive}
          hint={`${totals.repos} connected · ${totals.reposHosted} hosting docs`}
        />
        <StatCard
          label="Doc generations"
          value={totals.generations}
          hint={`+${totals.generations7d} in 7d · ${totals.generationsFailed} failed`}
        />
        <StatCard
          label="Tokens used"
          value={totals.tokensUsed}
          hint="AI spend, all time"
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <BarChart
          title="Signups per day"
          note={`${totals.signups7d} in last 7d`}
          points={stats.signupsByDay}
          barClassName="bg-accent"
        />
        <BarChart
          title="Doc generations per day"
          note={`${totals.generations7d} in last 7d`}
          points={stats.generationsByDay}
          barClassName="bg-emerald-500/70"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PlanBreakdown rows={stats.planBreakdown} total={totals.signups} />
        <section className="rounded-xl border border-dashed border-zinc-800 px-5 py-6">
          <h2 className="font-mono text-sm font-semibold text-zinc-100">
            Last {ADMIN_WINDOW_DAYS} days
          </h2>
          <ul className="mt-4 space-y-2 font-mono text-xs text-zinc-400">
            <li className="flex justify-between gap-4">
              <span className="text-zinc-500">signups</span>
              <span>
                {stats.signupsByDay.reduce((t, p) => t + p.count, 0)} · peak{" "}
                {Math.max(0, ...stats.signupsByDay.map((p) => p.count))} in a day
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-zinc-500">generations</span>
              <span>
                {stats.generationsByDay.reduce((t, p) => t + p.count, 0)} · peak{" "}
                {Math.max(0, ...stats.generationsByDay.map((p) => p.count))} in a day
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-zinc-500">repos made public</span>
              <span>{totals.reposHosted}</span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-zinc-500">generation failures</span>
              <span>
                {totals.generationsFailed} ·{" "}
                {totals.generations > 0
                  ? ((totals.generationsFailed / totals.generations) * 100).toFixed(1)
                  : "0.0"}
                % of runs
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
