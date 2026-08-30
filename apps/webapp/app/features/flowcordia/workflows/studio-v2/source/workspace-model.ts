import type { WorkflowSourceProject } from "@flowcordia/workflow";

export type WorkflowSourceFile = {
  code: string;
  hidden?: boolean;
  readOnly?: boolean;
};

export type WorkflowSourceWorkspace = {
  entrypoint: string;
  files: Record<string, WorkflowSourceFile>;
  dependencies: Record<string, string>;
  credentialReferences: string[];
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

export type StudioV2GeneratedWorkflowSource = {
  documentSha256: string;
  path: string;
  code: string | null;
  orderedNodeIds: string[];
  warnings: string[];
  issues: Array<{ message: string; nodeId?: string }>;
};

export type StudioV2SourceWorkspaceProjection = {
  workspace: WorkflowSourceWorkspace;
};

export const STUDIO_V2_SOURCE_ENTRYPOINT = "/src/index.ts";
export const STUDIO_V2_GENERATED_SOURCE = "/src/workflows/workflow.generated.ts";
export const STUDIO_V2_SOURCE_PACKAGE_JSON = "/package.json";
export const STUDIO_V2_SOURCE_PROJECT_CONFIG = "/flowcordia.json";
export const STUDIO_V2_SOURCE_TRIGGER_CONFIG = "/trigger.config.ts";
export const STUDIO_V2_SOURCE_CONTEXT_TYPES = "/src/flowcordia.d.ts";

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

export function workflowSourcePackageJson(
  dependencies: Record<string, string>,
  entrypoint = STUDIO_V2_SOURCE_ENTRYPOINT
): string {
  return JSON.stringify(
    {
      private: true,
      type: "module",
      dependencies: sortedDependencies(dependencies),
      devDependencies: {},
      main: normalizeWorkflowSourcePath(entrypoint),
    },
    null,
    2
  );
}

function workflowSourceProjectConfig(workspace: {
  entrypoint: string;
  credentialReferences: string[];
}): string {
  return `${JSON.stringify(
    {
      entrypoint: normalizeWorkflowSourcePath(workspace.entrypoint),
      credentialReferences: [...workspace.credentialReferences].sort(),
    },
    null,
    2
  )}\n`;
}

export function normalizeWorkflowSourceWorkspace(
  workspace: WorkflowSourceWorkspace
): WorkflowSourceWorkspace {
  const dependencies = { ...workspace.dependencies };
  const entrypoint = normalizeWorkflowSourcePath(workspace.entrypoint);
  const files = Object.fromEntries(
    Object.entries(workspace.files).map(([path, file]) => [
      normalizeWorkflowSourcePath(path),
      { ...file },
    ])
  );

  files[STUDIO_V2_SOURCE_PACKAGE_JSON] ??= {
    code: workflowSourcePackageJson(dependencies, entrypoint),
  };
  files[STUDIO_V2_SOURCE_PROJECT_CONFIG] ??= {
    code: workflowSourceProjectConfig(workspace),
  };

  return {
    entrypoint,
    files,
    dependencies,
    credentialReferences: [...workspace.credentialReferences],
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

  for (const [path, file] of Object.entries(nextFiles)) {
    if (!file.readOnly && !(path in codes)) delete nextFiles[path];
  }

  for (const [rawPath, code] of Object.entries(codes)) {
    const path = normalizeWorkflowSourcePath(rawPath);
    const existing = nextFiles[path];
    if (existing?.readOnly) continue;

    nextFiles[path] = existing ? { ...existing, code } : { code };
    if (path === STUDIO_V2_SOURCE_PACKAGE_JSON) {
      try {
        const parsed = JSON.parse(code) as { dependencies?: unknown };
        if (
          parsed.dependencies &&
          typeof parsed.dependencies === "object" &&
          !Array.isArray(parsed.dependencies) &&
          Object.values(parsed.dependencies).every((version) => typeof version === "string")
        ) {
          normalized.dependencies = { ...parsed.dependencies } as Record<string, string>;
        }
      } catch {
        // Keep the invalid draft visible; the save boundary returns the actionable error.
      }
    }
    if (path === STUDIO_V2_SOURCE_PROJECT_CONFIG) {
      try {
        const parsed = JSON.parse(code) as {
          entrypoint?: unknown;
          credentialReferences?: unknown;
        };
        if (typeof parsed.entrypoint === "string") {
          normalized.entrypoint = normalizeWorkflowSourcePath(parsed.entrypoint);
        }
        if (
          Array.isArray(parsed.credentialReferences) &&
          parsed.credentialReferences.every((reference) => typeof reference === "string")
        ) {
          normalized.credentialReferences = [...new Set(parsed.credentialReferences)];
        }
      } catch {
        // Keep invalid project configuration visible until the save boundary validates it.
      }
    }
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
    credentialReferences: [...normalized.credentialReferences].sort(),
  });
}

export function createInitialStudioV2SourceWorkspace(workflowId: string): WorkflowSourceWorkspace {
  return normalizeWorkflowSourceWorkspace({
    entrypoint: STUDIO_V2_SOURCE_ENTRYPOINT,
    files: {
      [STUDIO_V2_SOURCE_ENTRYPOINT]: {
        code: `export default async function run(ctx: FlowcordiaContext) {
  return {
    workflowId: ${JSON.stringify(workflowId)},
    input: ctx.input,
  };
}
`,
      },
      [STUDIO_V2_SOURCE_CONTEXT_TYPES]: {
        code: sourceContextTypes(),
        hidden: true,
        readOnly: true,
      },
      [STUDIO_V2_SOURCE_TRIGGER_CONFIG]: {
        code: `// Managed by Flowcordia.\nexport {};\n`,
        hidden: true,
        readOnly: true,
      },
    },
    dependencies: {},
    credentialReferences: [],
  });
}

function sourceContextTypes(): string {
  return `type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
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
`;
}

function storedSourceProject(document: unknown): WorkflowSourceProject | null {
  if (!document || typeof document !== "object" || Array.isArray(document)) return null;
  const metadata = (document as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const project = (metadata as { sourceProject?: unknown }).sourceProject;
  if (!project || typeof project !== "object" || Array.isArray(project)) return null;
  const value = project as WorkflowSourceProject;
  if (
    typeof value.entrypoint !== "string" ||
    !value.files ||
    typeof value.files !== "object" ||
    !value.dependencies ||
    typeof value.dependencies !== "object" ||
    !Array.isArray(value.credentialReferences)
  ) {
    return null;
  }
  return value;
}

export function createStudioV2SourceWorkspaceFromDocument(
  document: unknown,
  _workflowId: string,
  generatedSource?: StudioV2GeneratedWorkflowSource
): StudioV2SourceWorkspaceProjection {
  const generatedFiles: Record<string, WorkflowSourceFile> = {};
  if (generatedSource?.code) {
    generatedFiles[STUDIO_V2_GENERATED_SOURCE] = {
      code: generatedSource.code,
      readOnly: true,
    };
  }
  const stored = storedSourceProject(document);
  const initial = stored
    ? {
        entrypoint: stored.entrypoint,
        files: Object.fromEntries(
          Object.entries(stored.files).map(([path, file]) => [path, { ...file }])
        ),
        dependencies: { ...stored.dependencies },
        credentialReferences: [...stored.credentialReferences],
      }
    : createInitialStudioV2SourceWorkspace(_workflowId);
  return {
    workspace: normalizeWorkflowSourceWorkspace({
      ...initial,
      files: {
        ...initial.files,
        ...generatedFiles,
        [STUDIO_V2_SOURCE_CONTEXT_TYPES]: {
          code: sourceContextTypes(),
          hidden: true,
          readOnly: true,
        },
        [STUDIO_V2_SOURCE_TRIGGER_CONFIG]: {
          code: `// Managed by Flowcordia.\nexport {};\n`,
          hidden: true,
          readOnly: true,
        },
      },
    }),
  };
}

export function workflowSourceText(workspace: WorkflowSourceWorkspace): string | undefined {
  const normalized = normalizeWorkflowSourceWorkspace(workspace);
  const source = normalized.files[normalized.entrypoint]?.code;
  return typeof source === "string" && source.trim().length > 0 ? source : undefined;
}

export function workflowSourceProject(workspace: WorkflowSourceWorkspace): WorkflowSourceProject {
  const normalized = normalizeWorkflowSourceWorkspace(workspace);
  let dependencies = normalized.dependencies;
  let entrypoint = normalized.entrypoint;
  let credentialReferences = normalized.credentialReferences;
  try {
    const packageDocument = JSON.parse(
      normalized.files[STUDIO_V2_SOURCE_PACKAGE_JSON]?.code ?? "{}"
    ) as { dependencies?: unknown };
    if (
      packageDocument.dependencies !== undefined &&
      (typeof packageDocument.dependencies !== "object" ||
        packageDocument.dependencies === null ||
        Array.isArray(packageDocument.dependencies) ||
        !Object.values(packageDocument.dependencies).every(
          (version) => typeof version === "string"
        ))
    ) {
      throw new Error("dependencies must contain package names and exact versions");
    }
    dependencies = { ...(packageDocument.dependencies ?? {}) } as Record<string, string>;
  } catch (error) {
    throw new TypeError(
      `package.json is invalid: ${error instanceof Error ? error.message : "invalid JSON"}`
    );
  }
  try {
    const projectDocument = JSON.parse(
      normalized.files[STUDIO_V2_SOURCE_PROJECT_CONFIG]?.code ?? "{}"
    ) as { entrypoint?: unknown; credentialReferences?: unknown };
    if (typeof projectDocument.entrypoint !== "string") {
      throw new Error("entrypoint must be a file path");
    }
    if (
      !Array.isArray(projectDocument.credentialReferences) ||
      !projectDocument.credentialReferences.every((reference) => typeof reference === "string")
    ) {
      throw new Error("credentialReferences must be a string array");
    }
    entrypoint = normalizeWorkflowSourcePath(projectDocument.entrypoint);
    credentialReferences = [...new Set(projectDocument.credentialReferences)];
  } catch (error) {
    throw new TypeError(
      `flowcordia.json is invalid: ${error instanceof Error ? error.message : "invalid JSON"}`
    );
  }
  const files = Object.fromEntries(
    Object.entries(normalized.files)
      .filter(
        ([path, file]) =>
          path !== STUDIO_V2_SOURCE_PACKAGE_JSON &&
          path !== STUDIO_V2_SOURCE_PROJECT_CONFIG &&
          path !== STUDIO_V2_SOURCE_TRIGGER_CONFIG &&
          path !== STUDIO_V2_SOURCE_CONTEXT_TYPES &&
          path !== STUDIO_V2_GENERATED_SOURCE &&
          !file.readOnly
      )
      .map(([path, file]) => [path, { code: file.code }])
  );
  if (!files[entrypoint]) throw new TypeError(`Source entrypoint ${entrypoint} does not exist.`);
  return {
    entrypoint,
    files,
    dependencies,
    credentialReferences,
  };
}
