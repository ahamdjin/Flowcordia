import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = path.resolve(appRoot, "../..");
const upstreamRoot = path.join(repositoryRoot, "studio-v2/activepieces-web");
const packages = path.join(repositoryRoot, "studio-v2/activepieces-core-nodes/packages");

export default defineConfig({
  root: appRoot,
  base: "/flowcordia-studio-activepieces/",
  publicDir: false,
  cacheDir: path.join(repositoryRoot, "node_modules/.vite/flowcordia-studio-activepieces"),
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@codemirror/commands",
    ],
    alias: [
      {
        find: "@/app/builder/pieces-selector",
        replacement: path.join(appRoot, "src/flowcordia-piece-selector.tsx"),
      },
      { find: "@", replacement: path.join(upstreamRoot, "src") },
      { find: "@activepieces/shared", replacement: path.join(packages, "core/shared/src") },
      {
        find: "@activepieces/core-formula",
        replacement: path.join(packages, "core/formula/src"),
      },
      { find: "@activepieces/core-utils", replacement: path.join(packages, "core/utils/src") },
      {
        find: "@activepieces/core-piece-types",
        replacement: path.join(packages, "core/piece-types/src"),
      },
      {
        find: "@activepieces/core-execution",
        replacement: path.join(packages, "core/execution/src"),
      },
      {
        find: "@activepieces/pieces-framework",
        replacement: path.join(packages, "pieces/framework/src"),
      },
      {
        find: "@activepieces/piece-ai",
        replacement: path.join(packages, "pieces/community/ai/src"),
      },
      {
        find: "@flowcordia/workflow",
        replacement: path.join(repositoryRoot, "packages/flowcordia-workflow/src/index.ts"),
      },
      {
        find: "@flowcordia/foundation",
        replacement: path.join(repositoryRoot, "packages/flowcordia-foundation/src/index.ts"),
      },
      { find: "ee-embed-sdk", replacement: path.join(packages, "ee/embed-sdk/src") },
    ],
  },
  define: {
    __FLOWCORDIA_ACTIVEPIECES_UPSTREAM_COMMIT__: JSON.stringify(
      "d1b800f3db6db52379476c069ea3cdbd2c998276"
    ),
  },
  build: {
    outDir: path.join(appRoot, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    commonjsOptions: { transformMixedEsModules: true },
  },
  server: {
    host: "0.0.0.0",
    port: 4210,
    fs: { allow: [repositoryRoot] },
  },
});
