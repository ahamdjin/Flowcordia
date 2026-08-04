export type WorkflowSourceFile = {
  code: string;
  hidden?: boolean;
  readOnly?: boolean;
};

export type WorkflowSourceWorkspace = {
  entrypoint: string;
  files: Record<string, WorkflowSourceFile>;
  dependencies: Record<string, string>;
};

export type WorkflowSourceTestStatus = "idle" | "queued" | "running" | "success" | "error";

export type WorkflowSourceLog = {
  message: string;
  level?: "debug" | "info" | "warn" | "error";
  timestamp?: string;
};

export type WorkflowSourceProblem = {
  message: string;
  severity?: "info" | "warning" | "error";
  file?: string;
  line?: number;
  column?: number;
};

export const STUDIO_V2_SOURCE_ENTRYPOINT = "/src/workflows/workflow.ts";
export const STUDIO_V2_SOURCE_PACKAGE_JSON = "/package.json";
export const STUDIO_V2_SOURCE_TRIGGER_CONFIG = "/trigger.config.ts";

export function normalizeWorkflowSourcePath(path: string): string {
  const segments: string[] = [];

  for (const segment of path.trim().replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return `/${segments.join("/")}`;
}

function sortedDependencies(dependencies: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right))
  );
}

export function workflowSourcePackageJson(dependencies: Record<string, string>): string {
  return `${JSON.stringify(
    {
      private: true,
      type: "module",
      dependencies: sortedDependencies(dependencies),
    },
    null,
    2
  )}\n`;
}

export function normalizeWorkflowSourceWorkspace(
  workspace: WorkflowSourceWorkspace
): WorkflowSourceWorkspace {
  const dependencies = { ...workspace.dependencies };
  const files = Object.fromEntries(
    Object.entries(workspace.files).map(([path, file]) => [
      normalizeWorkflowSourcePath(path),
      { ...file },
    ])
  );

  files[STUDIO_V2_SOURCE_PACKAGE_JSON] = {
    code: workflowSourcePackageJson(dependencies),
    hidden: true,
    readOnly: true,
  };

  return {
    entrypoint: normalizeWorkflowSourcePath(workspace.entrypoint),
    files,
    dependencies,
  };
}

export function resolveWorkflowSourceActiveFile(
  workspace: WorkflowSourceWorkspace,
  requestedFile?: string
): string | undefined {
  const normalized = normalizeWorkflowSourceWorkspace(workspace);
  const requested = requestedFile ? normalizeWorkflowSourcePath(requestedFile) : undefined;

  if (requested && normalized.files[requested]) return requested;
  if (normalized.files[normalized.entrypoint]) return normalized.entrypoint;

  return (
    Object.entries(normalized.files).find(([, file]) => !file.hidden)?.[0] ??
    Object.keys(normalized.files)[0]
  );
}

export function isWorkflowSourceFileReadOnly(
  workspace: WorkflowSourceWorkspace,
  path: string | undefined,
  workspaceReadOnly = false
): boolean {
  if (workspaceReadOnly) return true;
  if (!path) return false;

  const normalized = normalizeWorkflowSourceWorkspace(workspace);
  return Boolean(normalized.files[normalizeWorkflowSourcePath(path)]?.readOnly);
}

/**
 * Merge Sandpack-owned source text back into the stable Flowcordia contract.
 * Managed/read-only files are protected at this boundary in addition to the
 * editor-level read-only behavior supplied by Sandpack.
 */
export function mergeWorkflowSourceCodes(
  workspace: WorkflowSourceWorkspace,
  codes: Record<string, string>
): WorkflowSourceWorkspace {
  const normalized = normalizeWorkflowSourceWorkspace(workspace);
  const nextFiles = { ...normalized.files };

  for (const [rawPath, code] of Object.entries(codes)) {
    const path = normalizeWorkflowSourcePath(rawPath);
    if (path === STUDIO_V2_SOURCE_PACKAGE_JSON) continue;

    const existing = nextFiles[path];
    if (existing?.readOnly) continue;

    nextFiles[path] = existing ? { ...existing, code } : { code };
  }

  return normalizeWorkflowSourceWorkspace({
    ...normalized,
    files: nextFiles,
  });
}

export function workflowSourceWorkspaceSignature(workspace: WorkflowSourceWorkspace): string {
  const normalized = normalizeWorkflowSourceWorkspace(workspace);
  const fileEntries = Object.entries(normalized.files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, file]) => [path, file.code, Boolean(file.hidden), Boolean(file.readOnly)]);
  const dependencyEntries = Object.entries(normalized.dependencies).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  return JSON.stringify({
    entrypoint: normalized.entrypoint,
    files: fileEntries,
    dependencies: dependencyEntries,
  });
}

export function createInitialStudioV2SourceWorkspace(workflowId: string): WorkflowSourceWorkspace {
  const workflowIdLiteral = JSON.stringify(workflowId);

  return normalizeWorkflowSourceWorkspace({
    entrypoint: STUDIO_V2_SOURCE_ENTRYPOINT,
    files: {
      [STUDIO_V2_SOURCE_ENTRYPOINT]: {
        code: `// Starter source draft for Flowcordia workflow ${workflowIdLiteral}.\n// This draft is not generated from, persisted to, or executed with the visual workflow yet.\n\nexport async function workflow(input: unknown) {\n  return input;\n}\n`,
      },
      [STUDIO_V2_SOURCE_TRIGGER_CONFIG]: {
        code: `// Managed by Flowcordia. Trigger.dev runtime wiring is intentionally deferred.\nexport {};\n`,
        hidden: true,
        readOnly: true,
      },
    },
    dependencies: {},
  });
}
