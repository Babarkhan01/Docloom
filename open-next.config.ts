import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal adapter config: no R2/DO-based incremental cache for the MVP —
// dynamic pages render on demand and static assets are served from the
// assets layer. Add cacheConfiguration here if ISR caching is introduced.
const config = defineCloudflareConfig({});

// Build with webpack instead of Next 16's default Turbopack: Turbopack emits
// hashed external specifiers (e.g. "typescript-<hash>") for lazily required
// packages, which OpenNext's esbuild bundling step cannot resolve.
config.buildCommand = "npm run build:webpack";

export default config;
