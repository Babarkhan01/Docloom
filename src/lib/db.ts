import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getEnv } from "./env";
import { loadEnvFileSecrets } from "./env-file";

// Fill any missing env vars from the optional gitignored secrets file before
// the first query (see env-file.ts).
loadEnvFileSecrets();

const globalForDb = globalThis as unknown as {
  dbClient?: ReturnType<typeof postgres>;
  db?: DB;
};

// Lazy singleton: importing this module must never require DATABASE_URL
// (Next.js evaluates route modules at build time). The client connects on
// first query, and getEnv() fails loudly there if the URL is missing.
function client() {
  if (!globalForDb.dbClient) {
  globalForDb.dbClient = postgres(getEnv("DATABASE_URL"), {
    max: 10,
    // Neon requires SSL
    ssl: "require",
    // Required for Neon's pooled (pgbouncer transaction-mode) endpoint — the
    // production DATABASE_URL uses -pooler hosts, which reject named prepared
    // statements. Negligible overhead vs. re-connects under pooler churn.
    prepare: false,
  });
  }
  return globalForDb.dbClient;
}

function instance(): DB {
  if (!globalForDb.db) {
    globalForDb.db = drizzle(client(), { schema });
  }
  return globalForDb.db;
}

export type DB = ReturnType<typeof drizzle<typeof schema>>;

// Property-access proxy that lazily resolves the real drizzle instance,
// keeping the `db.select()/insert()/...` call sites unchanged.
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    return Reflect.get(instance(), prop);
  },
});