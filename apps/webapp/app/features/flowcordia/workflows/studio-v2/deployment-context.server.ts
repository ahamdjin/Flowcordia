import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as tar from "tar";
import type { StudioV2ReleaseRecord } from "./release-contract";

const MAX_DEPLOYMENT_CONTEXT_BYTES = 100 * 1024 * 1024;
const TRIGGER_SDK_VERSION = "4.5.0-rc.7";
const FLOWCORDIA_PACKAGE_DIRECTORIES = [
  "packages/flowcordia-foundation",
  "packages/flowcordia-workflow",
  "packages/flowcordia-runtime",
] as const;

export interface StudioV2DeploymentContext {
  archivePath: string;
  contentLength: number;
  cleanup(): Promise<void>;
}

function repositoryRoot(): string {
  return resolve(process.cwd(), "../..");
}

function packageManifest(): string {
  return `${JSON.stringify(
    {
      name: "flowcordia-studio-v2-release",
      private: true,
      type: "module",
      packageManager: "pnpm@10.33.2",
      engines: { node: ">=20.20.2" },
      dependencies: {
        "@flowcordia/runtime": "workspace:*",
        "@trigger.dev/sdk": TRIGGER_SDK_VERSION,
      },
    },
    null,
    2
  )}\n`;
}

function workspaceManifest(): string {
  return `packages:\n  - "packages/*"\n`;
}

function triggerConfig(projectExternalRef: string): string {
  return `import { defineConfig } from "@trigger.dev/sdk";\n\nexport default defineConfig({\n  project: ${JSON.stringify(
    projectExternalRef
  )},\n  dirs: ["./trigger"],\n  runtime: "node-22",\n  build: {\n    external: ["secure-exec", "@secure-exec/typescript"],\n  },\n});\n`;
}

function rootTsconfig(): string {
  return `${JSON.stringify(
    {
      extends: "./.configs/tsconfig.base.json",
      compilerOptions: {
        noEmit: true,
        module: "ESNext",
        moduleResolution: "Bundler",
      },
      include: ["trigger/**/*.ts", "trigger.config.ts"],
    },
    null,
    2
  )}\n`;
}

function shouldCopyPackagePath(source: string): boolean {
  const normalized = source.replaceAll("\\", "/");
  return ![
    "/node_modules/",
    "/dist/",
    "/.turbo/",
    "/coverage/",
    "/.git/",
  ].some((segment) => normalized.includes(segment));
}

async function assertReadableFile(path: string): Promise<void> {
  try {
    await readFile(path);
  } catch {
    throw new Error(
      `Studio V2 native deployment requires Flowcordia package source at ${path}. Reinstall the complete Flowcordia application bundle.`
    );
  }
}

export async function createStudioV2DeploymentContext(input: {
  release: StudioV2ReleaseRecord;
  projectExternalRef: string;
}): Promise<StudioV2DeploymentContext> {
  const root = repositoryRoot();
  await assertReadableFile(join(root, ".configs", "tsconfig.base.json"));
  for (const packageDirectory of FLOWCORDIA_PACKAGE_DIRECTORIES) {
    await assertReadableFile(join(root, packageDirectory, "package.json"));
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "flowcordia-studio-v2-deploy-"));
  const contextDirectory = join(temporaryRoot, "context");
  const archivePath = join(temporaryRoot, "context.tar.gz");

  try {
    await mkdir(join(contextDirectory, "trigger"), { recursive: true });
    await mkdir(join(contextDirectory, ".configs"), { recursive: true });
    await writeFile(join(contextDirectory, "package.json"), packageManifest(), "utf8");
    await writeFile(join(contextDirectory, "pnpm-workspace.yaml"), workspaceManifest(), "utf8");
    await writeFile(
      join(contextDirectory, "trigger.config.ts"),
      triggerConfig(input.projectExternalRef),
      "utf8"
    );
    await writeFile(join(contextDirectory, "tsconfig.json"), rootTsconfig(), "utf8");
    await writeFile(
      join(contextDirectory, "trigger", "flowcordia.ts"),
      input.release.generatedSource,
      "utf8"
    );
    await cp(
      join(root, ".configs", "tsconfig.base.json"),
      join(contextDirectory, ".configs", "tsconfig.base.json")
    );

    for (const packageDirectory of FLOWCORDIA_PACKAGE_DIRECTORIES) {
      const destination = join(contextDirectory, packageDirectory);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(root, packageDirectory), destination, {
        recursive: true,
        filter: shouldCopyPackagePath,
      });
    }

    await tar.create(
      {
        cwd: contextDirectory,
        file: archivePath,
        gzip: true,
        portable: true,
        noMtime: true,
      },
      ["."]
    );
    const archive = await stat(archivePath);
    if (archive.size <= 0 || archive.size > MAX_DEPLOYMENT_CONTEXT_BYTES) {
      throw new Error(
        `Studio V2 deployment context must be between 1 byte and ${MAX_DEPLOYMENT_CONTEXT_BYTES} bytes.`
      );
    }

    return {
      archivePath,
      contentLength: archive.size,
      async cleanup() {
        await rm(temporaryRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export const studioV2DeploymentContextContract = {
  maxBytes: MAX_DEPLOYMENT_CONTEXT_BYTES,
  triggerSdkVersion: TRIGGER_SDK_VERSION,
  packageDirectories: [...FLOWCORDIA_PACKAGE_DIRECTORIES],
  externalPackages: ["secure-exec", "@secure-exec/typescript"] as const,
};
