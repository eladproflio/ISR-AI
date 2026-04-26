// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  base: '/', // אם יש לך דומיין משלך. אם אתה משתמש בכתובת של גיטהאב, שים פה את שם ה-Repo שלך עם סלאשים כמו '/my-repo/'
  plugins: [react()], // או מה שיש לך שם
})
