import { defineConfig } from "drizzle-kit";
import { loadEnvFileSecrets } from "./src/lib/env-file";

// Fill DATABASE_URL from the optional gitignored secrets file if missing.
loadEnvFileSecrets();

// `db:generate` does not connect to the database, so a placeholder URL is fine.
// `db:migrate` loads the real DATABASE_URL via dotenv-cli (see package.json).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/docloom",
  },
});