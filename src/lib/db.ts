import { drizzle as drizzleNeonHttp, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
import { getEnv } from "./env";
import { loadEnvFileSecrets } from "./env-file";

// Fill any missing env vars from the optional gitignored secrets file before
// the first query (see env-file.ts).
loadEnvFileSecrets();

const globalForDb = globalThis as unknown as {
  dbClient?: ReturnType<typeof neon>;
  db?: DB;
};

/**
 * Single driver: Neon's HTTP (fetch) driver. Required on Cloudflare Workers —
 * there are no raw TCP sockets, and the Workers TLS stack rejects postgres-js'
 * ssl rejectUnauthorized option outright. Pooled URLs (-pooler hosts) are
 * required: each HTTP query is one transaction, which only behaves correctly
 * behind pgbouncer/transaction mode. Use the pooled connection string for
 * DATABASE_URL (local dev included — the HTTP driver works the same there).
 */
function client() {
  if (!globalForDb.dbClient) {
    const url = getEnv("DATABASE_URL");
    if (!url.includes("-pooler.")) {
      throw new Error(
        "DATABASE_URL must be a Neon pooled connection string (-pooler host) — " +
          "Docloom uses Neon's HTTP driver, which requires the pooled endpoint.",
      );
    }
    globalForDb.dbClient = neon(url);
  }
  return globalForDb.dbClient;
}

function instance(): DB {
  if (!globalForDb.db) {
    globalForDb.db = drizzleNeonHttp(client(), { schema });
  }
  return globalForDb.db;
}

export type DB = NeonHttpDatabase<typeof schema>;

// Property-access proxy that lazily resolves the real drizzle instance,
// keeping the `db.select()/insert()/...` call sites unchanged.
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    return Reflect.get(instance(), prop);
  },
});
