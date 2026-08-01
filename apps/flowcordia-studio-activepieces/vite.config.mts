import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = path.resolve(appRoot, "../..");
const upstreamRoot = path.join(repositoryRoot, "studio-v2/activepieces-web");
const packages = path.join(repositoryRoot, "studio-v2/activepieces-core-nodes/packages");

function flowcordiaCanvasBoundary(): Plugin {
  const replacement = path.join(appRoot, "src/flowcordia-canvas.tsx");
  return {
    name: "flowcordia-activepieces-canvas-host",
    enforce: "pre",
    resolveId(source, importer) {
      const isStudioHost = importer?.endsWith("/src/studio-host.tsx") ?? false;
      return isStudioHost && source === "@/app/builder/flow-canvas" ? replacement : null;
    },
  };
}

function flowcordiaPieceApiBoundary(): Plugin {
  const replacement = path.join(appRoot, "src/activepieces-pieces-api.ts");
  return {
    name: "flowcordia-activepieces-piece-api",
    enforce: "pre",
    resolveId(source, importer) {
      const isPieceFeature = importer?.includes("/features/pieces/") ?? false;
      const isPieceApiImport = source === "../api/pieces-api" || source === "./api/pieces-api";
      return isPieceFeature && isPieceApiImport ? replacement : null;
    },
  };
}

export default defineConfig({
  root: appRoot,
  base: "/flowcordia-studio-activepieces/",
  // The adapted upstream styles and builder surfaces reference pinned public
  // assets (fonts, logos, and suggestion art) by absolute path. Include that
  // exact mirror directory so Vite rewrites the URLs under Flowcordia's base.
  publicDir: path.join(upstreamRoot, "public"),
  cacheDir: path.join(repositoryRoot, "node_modules/.vite/flowcordia-studio-activepieces"),
  plugins: [flowcordiaCanvasBoundary(), flowcordiaPieceApiBoundary(), react(), tailwindcss()],
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
        find: "ai",
        replacement: path.join(appRoot, "src/activepieces-ai.ts"),
      },
      {
        find: "./state/chat-state",
        replacement: path.join(appRoot, "src/activepieces-chat-state.ts"),
      },
      {
        find: "@/i18n",
        replacement: path.join(appRoot, "src/activepieces-i18n.ts"),
      },
      {
        find: "@/hooks/flags-hooks",
        replacement: path.join(appRoot, "src/activepieces-flags.ts"),
      },
      {
        find: "@/app/builder/pieces-selector",
        replacement: path.join(appRoot, "src/flowcordia-piece-selector.tsx"),
      },
      {
        find: "@flowcordia/activepieces-flow-canvas-upstream",
        replacement: path.join(upstreamRoot, "src/app/builder/flow-canvas/index.tsx"),
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
        replacement: path.join(appRoot, "src/activepieces-pieces-framework-browser.ts"),
      },
      {
        find: "@activepieces/piece-ai",
        replacement: path.join(packages, "pieces/community/ai/src"),
      },
      {
        find: "@flowcordia/workflow",
        replacement: path.join(appRoot, "src/flowcordia-workflow-browser.ts"),
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
