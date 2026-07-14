export interface GitHubRepositoryTarget {
  owner: string;
  name: string;
  branch: string;
}

export interface GitHubWorkflowAccessScope {
  tenantId: string;
  projectId: string;
  installationId: number;
  repository: GitHubRepositoryTarget;
}

export interface GitHubWorkflowMutationContext {
  actorId: string;
  correlationId: string;
  reason?: string;
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9._:@/-]{1,160}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function hasForbiddenRefCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x20 || "~^:?*[\\".includes(character);
  });
}

function validateBranch(branch: string): string | undefined {
  if (branch.length === 0 || branch.length > 255) {
    return "Repository branch must contain between 1 and 255 characters.";
  }

  if (
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch === "@" ||
    branch.includes("//") ||
    branch.includes("..") ||
    branch.includes("@{") ||
    hasForbiddenRefCharacter(branch)
  ) {
    return "Repository branch is not a valid Git ref name.";
  }

  if (branch.split("/").some((segment) => segment.startsWith(".") || segment.endsWith(".lock"))) {
    return "Repository branch is not a valid Git ref name.";
  }

  return undefined;
}

export function validateRevision(revision: string): string | undefined {
  return validateBranch(revision);
}

export function validateAccessScope(scope: unknown): string[] {
  const issues: string[] = [];

  if (!isRecord(scope)) {
    return ["GitHub workflow access scope is required."];
  }

  if (typeof scope.tenantId !== "string" || !OPAQUE_ID_PATTERN.test(scope.tenantId)) {
    issues.push("Tenant ID has an invalid format.");
  }
  if (typeof scope.projectId !== "string" || !OPAQUE_ID_PATTERN.test(scope.projectId)) {
    issues.push("Project ID has an invalid format.");
  }
  if (
    typeof scope.installationId !== "number" ||
    !Number.isSafeInteger(scope.installationId) ||
    scope.installationId <= 0
  ) {
    issues.push("GitHub installation ID must be a positive safe integer.");
  }

  if (!isRecord(scope.repository)) {
    issues.push("GitHub repository target is required.");
    return issues;
  }
  if (
    typeof scope.repository.owner !== "string" ||
    !OWNER_PATTERN.test(scope.repository.owner) ||
    scope.repository.owner.includes("--")
  ) {
    issues.push("Repository owner has an invalid format.");
  }
  if (
    typeof scope.repository.name !== "string" ||
    !REPOSITORY_PATTERN.test(scope.repository.name) ||
    scope.repository.name === "." ||
    scope.repository.name === ".."
  ) {
    issues.push("Repository name has an invalid format.");
  }

  if (typeof scope.repository.branch !== "string") {
    issues.push("Repository branch is required.");
  } else {
    const branchIssue = validateBranch(scope.repository.branch);
    if (branchIssue) issues.push(branchIssue);
  }

  return issues;
}

export function validateMutationContext(context: unknown): string[] {
  const issues: string[] = [];

  if (!isRecord(context)) {
    return ["GitHub workflow mutation context is required."];
  }

  if (typeof context.actorId !== "string" || !OPAQUE_ID_PATTERN.test(context.actorId)) {
    issues.push("Actor ID has an invalid format.");
  }
  if (typeof context.correlationId !== "string" || !OPAQUE_ID_PATTERN.test(context.correlationId)) {
    issues.push("Correlation ID has an invalid format.");
  }
  if (
    context.reason !== undefined &&
    (typeof context.reason !== "string" ||
      context.reason.trim().length === 0 ||
      context.reason.length > 200 ||
      hasControlCharacter(context.reason))
  ) {
    issues.push("Mutation reason must be a single line containing at most 200 characters.");
  }

  return issues;
}
