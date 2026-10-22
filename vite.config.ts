// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Server code reads secrets from process.env, but Vite only exposes VITE_* vars.
// Load .env / .env.local into process.env so SUPABASE_URL, GEMINI_API_KEY etc. work when self-hosting.
const __mode = process.env.NODE_ENV === "production" ? "production" : "development";
for (const [k, v] of Object.entries(loadEnv(__mode, process.cwd(), ""))) {
  if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v;
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});