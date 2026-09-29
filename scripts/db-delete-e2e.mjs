#!/usr/bin/env node
// Live-DB verification of the account-deletion cascade (one-shot, synthetic
// rows only, self-cleaning — same conventions as billing-smoke.mjs):
//   1. Insert throwaway user + repo + hosted generation + usage counter
//      (namespaced e2e-<ts> so re-runs never collide).
//   2. Replay EXACTLY the two statements the delete route runs:
//      session_version bump → users delete.
//   3. Verify every child row is gone via the FK cascades.
// On any failure the synthetic user is deleted before exiting non-zero.
// Reads DATABASE_URL from .env.local(.secrets); never prints it.
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

for (const f of [".env.local", ".env.local.secrets"]) { // .env.local wins — secrets file fills gaps (matches env-file.ts)
  try {
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // optional file
  }
}
if (!process.env.DATABASE_URL?.includes("-pooler.")) {
  console.error("DATABASE_URL (pooled) not found — nothing ran.");
  process.exit(2);
}

const sql = neon(process.env.DATABASE_URL);
const stamp = `e2e-${Date.now()}`;
let userId = null;

try {
  const [user] = await sql`
    insert into users (github_id, login, name, plan, dodo_subscription_status,
                       github_access_token_encrypted, session_version)
    values (${stamp}, ${stamp}, 'Deletion E2E (synthetic)', 'pro', null,
            'iv.tag.ciphertext', 3)
    returning id`;
  userId = user.id;

  const [repo] = await sql`
    insert into repos (user_id, github_repo_full_name, owner, name, installation_id,
                       default_branch, is_private, docs_subdomain, status)
    values (${userId}, ${stamp + "/" + stamp}, ${stamp}, ${stamp}, 0,
            'main', false, ${stamp + ".docloom.app"}, 'active')
    returning id`;

  const [gen] = await sql`
    insert into generations (repo_id, status, markdown, tokens_used, triggered_by, started_at, completed_at)
    values (${repo.id}, 'success', '# e2e synthetic', 1, 'manual', now(), now())
    returning id`;

  await sql`update repos set published_generation_id = ${gen.id} where id = ${repo.id}`;
  await sql`
    insert into usage_counters (user_id, period_start, generations_count, tokens_used_total)
    values (${userId}, current_date, 1, 1)`;

  const count = async (table, where) => {
    // sql.query for dynamic fragments — neon's sql`` tag rejects call-form.
    // table/where are literals defined below, never user input.
    const [row] = await sql.query(`select count(*)::int as n from ${table} where ${where}`, []);
    return row.n;
  };
  const before = {
    user: await count("users", `id = '${userId}'`),
    repo: await count("repos", `id = '${repo.id}'`),
    generation: await count("generations", `id = '${gen.id}'`),
    counter: await count("usage_counters", `user_id = '${userId}'`),
  };
  if (Object.values(before).some((n) => n !== 1)) throw new Error(`fixture incomplete: ${JSON.stringify(before)}`);
  console.log(`fixture ok: user + repo + hosted generation + counter (session_version=3)`);

  // The route's exact two statements (api/account/delete/route.ts).
  await sql`update users set session_version = session_version + 1, updated_at = now() where id = ${userId}`;
  const [bumped] = await sql`select session_version from users where id = ${userId}`;
  if (bumped.session_version !== 4) throw new Error(`session bump failed: ${bumped.session_version}`);
  await sql`delete from users where id = ${userId}`;
  userId = null; // cascade cleaned everything — cleanup() is now a no-op

  const after = {
    user: await count("users", `id = '${user.id}'`),
    repo: await count("repos", `id = '${repo.id}'`),
    generation: await count("generations", `id = '${gen.id}'`),
    counter: await count("usage_counters", `user_id = '${user.id}'`),
  };
  console.log("post-delete counts (want all 0):", JSON.stringify(after));
  if (Object.values(after).some((n) => n !== 0)) throw new Error("cascade incomplete — rows survived");
  console.log("PASS: session bump + user delete cascaded repos, generations, usage counters");
  process.exit(0);
} catch (err) {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  try {
    if (userId) {
      await sql`delete from users where id = ${userId}`;
      console.error("cleanup: synthetic rows removed");
    }
  } catch (cleanupErr) {
    console.error(`cleanup failed — manual: delete from users where github_id = '${stamp}'`, cleanupErr);
  }
  process.exit(1);
}
