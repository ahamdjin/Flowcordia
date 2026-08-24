import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { WorkflowSourceProject } from "@flowcordia/workflow";

const execFileAsync = promisify(execFile);
const MAX_DEPLOYMENT_CONTEXT_BYTES = 100 * 1024 * 1024;
const TRIGGER_SDK_VERSION = "4.5.0-rc.7";
const FLOWCORDIA_PACKAGE_DIRECTORIES = [
  "packages/flowcordia-foundation",
  "packages/flowcordia-workflow",
] as const;

export const STUDIO_V2_SOURCE_TEST_TASK_ID = "flowcordia-studio-source-test";
export const STUDIO_V2_SOURCE_TEST_RUNNER_VERSION = "0.3.0";

export interface StudioV2SourceTestContext {
  archivePath: string;
  contentLength: number;
  contentHash: string;
  cleanup(): Promise<void>;
}

function repositoryRoot(): string {
  return resolve(process.cwd(), "../..");
}

function normalizedProject(project: WorkflowSourceProject): WorkflowSourceProject {
  return {
    entrypoint: project.entrypoint.replaceAll("\\", "/"),
    files: Object.fromEntries(
      Object.entries(project.files)
        .map(([path, file]) => [path.replaceAll("\\", "/"), { code: file.code }] as const)
        .sort(([left], [right]) => left.localeCompare(right))
    ),
    dependencies: Object.fromEntries(
      Object.entries(project.dependencies).sort(([left], [right]) => left.localeCompare(right))
    ),
    credentialReferences: [...project.credentialReferences].sort(),
  };
}

export function studioV2SourceTestIdentity(project: WorkflowSourceProject): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        runnerVersion: STUDIO_V2_SOURCE_TEST_RUNNER_VERSION,
        project: normalizedProject(project),
      })
    )
    .digest("hex");
}

function packageManifest(project: WorkflowSourceProject): string {
  return `${JSON.stringify(
    {
      name: "flowcordia-studio-v2-source-test",
      private: true,
      type: "module",
      packageManager: "pnpm@10.33.2",
      engines: { node: ">=20.20.2" },
      dependencies: {
        ...project.dependencies,
        "@flowcordia/workflow": "workspace:*",
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
  )},\n  dirs: ["./trigger"],\n  runtime: "node-22",\n});\n`;
}

function rootTsconfig(): string {
  return `${JSON.stringify(
    {
      extends: "./.configs/tsconfig.base.json",
      compilerOptions: {
        noEmit: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        allowImportingTsExtensions: true,
      },
      include: ["source/**/*.ts", "source/**/*.tsx", "trigger/**/*.ts", "trigger.config.ts"],
    },
    null,
    2
  )}\n`;
}

function managedSourceTypes(): string {
  return `import type { JsonValue } from "@flowcordia/workflow";

declare global {
  interface FlowcordiaContext {
    input: JsonValue;
    steps: Readonly<Record<string, JsonValue>>;
    variables: Readonly<Record<string, JsonValue>>;
    credentials: {
      has(reference: string): boolean;
      get(reference: string): Promise<JsonValue>;
    };
    execution: {
      workflowId: string;
      environment: "test" | "staging" | "production";
      runId?: string;
    };
  }
}

export {};
`;
}

function shouldCopyPackagePath(source: string): boolean {
  const normalized = source.replaceAll("\\", "/");
  return !["/node_modules/", "/dist/", "/.turbo/", "/coverage/", "/.git/"].some((segment) =>
    normalized.includes(segment)
  );
}

async function assertReadableFile(path: string): Promise<void> {
  try {
    await readFile(path);
  } catch {
    throw new Error(
      `Studio V2 Source testing requires Flowcordia package source at ${path}. Reinstall the complete Flowcordia application bundle.`
    );
  }
}

async function createPortableArchive(input: {
  contextDirectory: string;
  archivePath: string;
}): Promise<void> {
  try {
    await execFileAsync(
      "tar",
      [
        "--create",
        "--gzip",
        "--file",
        input.archivePath,
        "--directory",
        input.contextDirectory,
        "--sort=name",
        "--mtime=@0",
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        ".",
      ],
      { maxBuffer: 1024 * 1024 }
    );
    return;
  } catch (gnuTarError) {
    try {
      await execFileAsync("tar", ["-czf", input.archivePath, "-C", input.contextDirectory, "."], {
        maxBuffer: 1024 * 1024,
      });
      return;
    } catch (portableTarError) {
      throw new Error(
        `Flowcordia could not create the Source test archive. Ensure the self-host image includes tar. ${
          portableTarError instanceof Error
            ? portableTarError.message
            : gnuTarError instanceof Error
              ? gnuTarError.message
              : ""
        }`.trim()
      );
    }
  }
}

function sourceTestTaskSource(project: WorkflowSourceProject): string {
  const entrypoint = `../source/${project.entrypoint.replace(/^\/+/, "")}`;
  return `import runWorkflow from ${JSON.stringify(entrypoint)};
import { flowcordiaCredentialEnvironmentName, type JsonValue } from "@flowcordia/workflow";
import { metadata, task } from "@trigger.dev/sdk";

const RESULT_LIMIT_BYTES = 64 * 1024;
const CREDENTIAL_REFERENCES = ${JSON.stringify(project.credentialReferences)} as const;

type SourceTestPayload = {
  requestId: string;
  workflowId: string;
  input?: JsonValue;
};

function credentialValue(reference: string): JsonValue {
  const environmentName = flowcordiaCredentialEnvironmentName(reference);
  const raw = process.env[environmentName];
  if (!raw) throw new Error(\`Source credential environment "\${environmentName}" is unavailable.\`);
  return JSON.parse(raw) as JsonValue;
}

function resultMetadata(requestId: string, status: "RUNNING" | "SUCCEEDED" | "FAILED", value?: unknown) {
  const updatedAt = new Date().toISOString();
  if (status === "SUCCEEDED") {
    const serialized = JSON.stringify(value ?? null);
    if (Buffer.byteLength(serialized, "utf8") > RESULT_LIMIT_BYTES) {
      throw new Error("Source test output exceeds the bounded 64 KiB result limit.");
    }
    metadata.set("flowcordiaStudioSourceTest", {
      schemaVersion: "0.1",
      requestId,
      status,
      result: serialized,
      updatedAt,
    });
    return;
  }
  metadata.set("flowcordiaStudioSourceTest", {
    schemaVersion: "0.1",
    requestId,
    status,
    ...(typeof value === "string" ? { message: value } : {}),
    updatedAt,
  });
}

export const flowcordiaStudioSourceTest = task({
  id: ${JSON.stringify(STUDIO_V2_SOURCE_TEST_TASK_ID)},
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async (payload: SourceTestPayload, { ctx }) => {
    resultMetadata(payload.requestId, "RUNNING");
    try {
      const availableCredentials = new Set<string>(CREDENTIAL_REFERENCES);
      const result = await runWorkflow({
        input: payload.input ?? null,
        steps: {},
        variables: {},
        credentials: {
          has: (reference: string) => availableCredentials.has(reference),
          get: async (reference: string) => {
            if (!availableCredentials.has(reference)) {
              throw new Error(\`Source credential "\${reference}" is not declared.\`);
            }
            return credentialValue(reference);
          },
        },
        execution: {
          workflowId: payload.workflowId,
          environment: "test" as const,
          runId: ctx.run.id,
        },
      });
      resultMetadata(payload.requestId, "SUCCEEDED", result);
      return result;
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : "TypeScript Source test failed.";
      resultMetadata(payload.requestId, "FAILED", message);
      throw error;
    }
  },
});
`;
}

function safeProjectPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new Error(`Invalid Source project path: ${path}`);
  }
  return normalized;
}

export async function createStudioV2SourceTestContext(input: {
  projectExternalRef: string;
  sourceProject: WorkflowSourceProject;
}): Promise<StudioV2SourceTestContext> {
  const root = repositoryRoot();
  await assertReadableFile(join(root, ".configs", "tsconfig.base.json"));
  for (const packageDirectory of FLOWCORDIA_PACKAGE_DIRECTORIES) {
    await assertReadableFile(join(root, packageDirectory, "package.json"));
  }

  const sourceProject = normalizedProject(input.sourceProject);
  if (!sourceProject.files[sourceProject.entrypoint]) {
    throw new Error(`Source entrypoint ${sourceProject.entrypoint} does not exist.`);
  }
  const generatedSource = sourceTestTaskSource(sourceProject);
  const contentHash = studioV2SourceTestIdentity(sourceProject);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "flowcordia-studio-v2-source-test-"));
  const contextDirectory = join(temporaryRoot, "context");
  const archivePath = join(temporaryRoot, "context.tar.gz");

  try {
    await mkdir(join(contextDirectory, "trigger"), { recursive: true });
    await mkdir(join(contextDirectory, "source"), { recursive: true });
    await mkdir(join(contextDirectory, ".configs"), { recursive: true });
    await writeFile(join(contextDirectory, "package.json"), packageManifest(sourceProject), "utf8");
    await writeFile(join(contextDirectory, "pnpm-workspace.yaml"), workspaceManifest(), "utf8");
    await writeFile(
      join(contextDirectory, "trigger.config.ts"),
      triggerConfig(input.projectExternalRef),
      "utf8"
    );
    await writeFile(join(contextDirectory, "tsconfig.json"), rootTsconfig(), "utf8");
    await writeFile(join(contextDirectory, "trigger", "source-test.ts"), generatedSource, "utf8");
    await writeFile(
      join(contextDirectory, "source", "flowcordia.d.ts"),
      managedSourceTypes(),
      "utf8"
    );

    for (const [path, file] of Object.entries(sourceProject.files)) {
      const destination = join(contextDirectory, "source", safeProjectPath(path));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.code, "utf8");
    }

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

    await createPortableArchive({ contextDirectory, archivePath });
    const archive = await stat(archivePath);
    if (archive.size <= 0 || archive.size > MAX_DEPLOYMENT_CONTEXT_BYTES) {
      throw new Error(
        `Studio V2 Source test context must be between 1 byte and ${MAX_DEPLOYMENT_CONTEXT_BYTES} bytes.`
      );
    }

    return {
      archivePath,
      contentLength: archive.size,
      contentHash,
      async cleanup() {
        await rm(temporaryRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}
