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
  root: upstreamRoot,
  cacheDir: path.join(repositoryRoot, "node_modules/.vite/flowcordia-studio-activepieces"),
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom", "@codemirror/state", "@codemirror/view", "@codemirror/language", "@codemirror/commands"],
    alias: {
      "@": path.join(upstreamRoot, "src"),
      "@activepieces/shared": path.join(packages, "core/shared/src"),
      "@activepieces/core-formula": path.join(packages, "core/formula/src"),
      "@activepieces/core-utils": path.join(packages, "core/utils/src"),
      "@activepieces/core-piece-types": path.join(packages, "core/piece-types/src"),
      "@activepieces/core-execution": path.join(packages, "core/execution/src"),
      "@activepieces/pieces-framework": path.join(packages, "pieces/framework/src"),
      "@activepieces/piece-ai": path.join(packages, "pieces/community/ai/src"),
      "ee-embed-sdk": path.join(packages, "ee/embed-sdk/src")
    }
  },
  define: {
    __FLOWCORDIA_ACTIVEPIECES_UPSTREAM_COMMIT__: JSON.stringify("d1b800f3db6db52379476c069ea3cdbd2c998276")
  },
  build: {
    outDir: path.join(appRoot, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    commonjsOptions: { transformMixedEsModules: true }
  },
  server: { host: "0.0.0.0", port: 4210 }
});
