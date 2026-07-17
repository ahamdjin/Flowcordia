const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SOURCE_EXTENSION_PATTERN = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export const MAX_GITHUB_SOURCE_PATCH_FILES = 32;
export const MAX_GITHUB_SOURCE_PATCH_BYTES = 256 * 1024;
export const MAX_GITHUB_SOURCE_PATCH_TOTAL_BYTES = 1024 * 1024;

export interface GitHubRepositorySourcePatch {
  path: string;
  sourceText: string;
  expectedBlobSha: string | null;
}

export type GitHubRepositorySourcePatchIssueCode =
  | "invalid_patch"
  | "invalid_path"
  | "protected_path"
  | "unsupported_extension"
  | "invalid_blob_sha"
  | "invalid_source"
  | "file_too_large"
  | "too_many_files"
  | "total_too_large"
  | "duplicate_path";

export interface GitHubRepositorySourcePatchIssue {
  code: GitHubRepositorySourcePatchIssueCode;
  message: string;
  index?: number;
  path?: string;
}

export type GitHubRepositorySourcePatchValidation =
  | { success: true; patches: readonly GitHubRepositorySourcePatch[]; totalBytes: number }
  | { success: false; issues: readonly GitHubRepositorySourcePatchIssue[] };

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function pathIssue(path: string): GitHubRepositorySourcePatchIssue | null {
  if (
    path.length === 0 ||
    path.length > 512 ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(path)
  ) {
    return { code: "invalid_path", message: "Source patch path must be bounded POSIX repository path.", path };
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return { code: "invalid_path", message: "Source patch path cannot contain empty, dot, or traversal segments.", path };
  }
  const normalized = path.toLowerCase();
  if (
    normalized === ".git" ||
    normalized.startsWith(".git/") ||
    normalized === ".github/workflows" ||
    normalized.startsWith(".github/workflows/") ||
    normalized === ".flowcordia/workflows" ||
    normalized.startsWith(".flowcordia/workflows/") ||
    normalized === "trigger/flowcordia" ||
    normalized.startsWith("trigger/flowcordia/")
  ) {
    return {
      code: "protected_path",
      message: "Source patches cannot modify repository control, workflow intent, or generated artifact paths.",
      path,
    };
  }
  if (!SOURCE_EXTENSION_PATTERN.test(path)) {
    return {
      code: "unsupported_extension",
      message: "Source patches are limited to JavaScript and TypeScript source files.",
      path,
    };
  }
  return null;
}

export function validateGitHubRepositorySourcePatches(
  value: unknown
): GitHubRepositorySourcePatchValidation {
  if (!Array.isArray(value)) {
    return {
      success: false,
      issues: [{ code: "invalid_patch", message: "Source patches must be an array." }],
    };
  }
  if (value.length > MAX_GITHUB_SOURCE_PATCH_FILES) {
    return {
      success: false,
      issues: [
        {
          code: "too_many_files",
          message: `Source patches are limited to ${MAX_GITHUB_SOURCE_PATCH_FILES} files.`,
        },
      ],
    };
  }

  const issues: GitHubRepositorySourcePatchIssue[] = [];
  const patches: GitHubRepositorySourcePatch[] = [];
  const paths = new Set<string>();
  let totalBytes = 0;

  value.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      issues.push({ code: "invalid_patch", message: "Each source patch must be an object.", index });
      return;
    }
    const patch = candidate as Record<string, unknown>;
    const keys = Object.keys(patch).sort();
    if (
      keys.length !== 3 ||
      keys[0] !== "expectedBlobSha" ||
      keys[1] !== "path" ||
      keys[2] !== "sourceText"
    ) {
      issues.push({
        code: "invalid_patch",
        message: "Source patch objects may contain only path, sourceText, and expectedBlobSha.",
        index,
      });
      return;
    }
    if (typeof patch.path !== "string") {
      issues.push({ code: "invalid_path", message: "Source patch path is required.", index });
      return;
    }
    const invalidPath = pathIssue(patch.path);
    if (invalidPath) {
      issues.push({ ...invalidPath, index });
      return;
    }
    const pathKey = patch.path.toLowerCase();
    if (paths.has(pathKey)) {
      issues.push({
        code: "duplicate_path",
        message: "Source patch paths must be unique, including case-insensitive collisions.",
        index,
        path: patch.path,
      });
      return;
    }
    paths.add(pathKey);

    if (
      patch.expectedBlobSha !== null &&
      (typeof patch.expectedBlobSha !== "string" || !OBJECT_ID_PATTERN.test(patch.expectedBlobSha))
    ) {
      issues.push({
        code: "invalid_blob_sha",
        message: "Expected source blob SHA must be null or a hexadecimal Git object ID.",
        index,
        path: patch.path,
      });
      return;
    }
    if (typeof patch.sourceText !== "string" || CONTROL_CHARACTER_PATTERN.test(patch.sourceText.replaceAll("\n", "").replaceAll("\r", "").replaceAll("\t", ""))) {
      issues.push({
        code: "invalid_source",
        message: "Source patch content must be UTF-8 text without unsupported control characters.",
        index,
        path: patch.path,
      });
      return;
    }
    const bytes = byteLength(patch.sourceText);
    if (bytes > MAX_GITHUB_SOURCE_PATCH_BYTES) {
      issues.push({
        code: "file_too_large",
        message: `A source patch cannot exceed ${MAX_GITHUB_SOURCE_PATCH_BYTES} bytes.`,
        index,
        path: patch.path,
      });
      return;
    }
    totalBytes += bytes;
    patches.push({
      path: patch.path,
      sourceText: patch.sourceText,
      expectedBlobSha: patch.expectedBlobSha,
    });
  });

  if (totalBytes > MAX_GITHUB_SOURCE_PATCH_TOTAL_BYTES) {
    issues.push({
      code: "total_too_large",
      message: `Combined source patches cannot exceed ${MAX_GITHUB_SOURCE_PATCH_TOTAL_BYTES} bytes.`,
    });
  }
  if (issues.length > 0) return { success: false, issues };

  return {
    success: true,
    patches: patches.sort((left, right) => left.path.localeCompare(right.path)),
    totalBytes,
  };
}
