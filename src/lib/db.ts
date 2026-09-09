import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import postgres from "postgres";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
import { getEnv } from "./env";
import { loadEnvFileSecrets } from "./env-file";

// Fill any missing env vars from the optional gitignored secrets file before
// the first query (see env-file.ts).
loadEnvFileSecrets();

const globalForDb = globalThis as unknown as {
  dbClient?: unknown;
  db?: DB;
};

/**
 * Driver selection:
 * - neon-http: Neon's HTTP (fetch) driver. Required on Cloudflare Workers —
 *   the TCP driver cannot connect (no raw sockets), and Workers' TLS stack
 *   rejects postgres-js' ssl rejectUnauthorized option outright. Pooled URLs
 *   (-pooler hosts) are safe for HTTP queries: each fetch is one transaction.
 * - postgres-js: standard TCP driver for direct (non-pooled) connections.
 *
 * Override with DOCLOOM_DB_DRIVER=neon-http|postgres if needed. drizzle-kit
 * migrations use their own client (drizzle.config.ts) and are unaffected.
 */
function useNeonHttp(url: string): boolean {
  if (process.env.DOCLOOM_DB_DRIVER) return process.env.DOCLOOM_DB_DRIVER === "neon-http";
  return url.includes("-pooler.");
}

// Lazy singleton: importing this module must never require DATABASE_URL
// (Next.js evaluates route modules at build time). The client connects on
// first query, and getEnv() fails loudly there if the URL is missing.
function client() {
  if (!globalForDb.dbClient) {
    const url = getEnv("DATABASE_URL");
    if (useNeonHttp(url)) {
      globalForDb.dbClient = neon(url);
    } else {
      globalForDb.dbClient = postgres(url, {
        max: 10,
        // Neon requires SSL
        ssl: "require",
        // Required when a pgbouncer transaction-mode endpoint is used with the
        // TCP driver — it rejects named prepared statements.
        prepare: false,
      });
    }
  }
  return globalForDb.dbClient;
}

function instance(): DB {
  if (!globalForDb.db) {
    const clientInstance = client();
    globalForDb.db = (
      globalForDb.dbClient instanceof postgres
        ? drizzlePostgres(clientInstance as ReturnType<typeof postgres>, { schema })
        : drizzleNeonHttp(clientInstance as ReturnType<typeof neon>, { schema })
    ) as DB;
  }
  return globalForDb.db;
}

export type DB = ReturnType<typeof drizzlePostgres<typeof schema>>;

// Property-access proxy that lazily resolves the real drizzle instance,
// keeping the `db.select()/insert()/...` call sites unchanged.
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    return Reflect.get(instance(), prop);
  },
});
