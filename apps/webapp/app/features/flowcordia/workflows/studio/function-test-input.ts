import {
  createWorkflowFunctionPreviewValue,
  formatWorkflowFunctionValuePath,
  validateWorkflowFunctionValue,
  type JsonObject,
  type JsonValue,
  type WorkflowFunctionValueIssue,
} from "@flowcordia/workflow";

export type WorkflowFunctionTestPath = ReadonlyArray<string | number>;

export interface WorkflowFunctionTestIssue {
  code: WorkflowFunctionValueIssue["code"];
  message: string;
  path: WorkflowFunctionTestPath;
  displayPath: string;
}

export function createWorkflowFunctionTestPayload(schema: JsonObject): JsonValue {
  return createWorkflowFunctionPreviewValue(schema);
}

export function validateWorkflowFunctionTestPayload(
  schema: JsonObject,
  value: JsonValue
): WorkflowFunctionTestIssue[] {
  return validateWorkflowFunctionValue(schema, value).map((issue) => ({
    ...issue,
    displayPath: formatWorkflowFunctionValuePath(issue.path),
  }));
}

export function workflowFunctionTestPathKey(path: WorkflowFunctionTestPath): string {
  return path
    .map((segment) => String(segment).replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/");
}

export function workflowFunctionTestValueAtPath(
  value: JsonValue,
  path: WorkflowFunctionTestPath
): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else {
      if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
      current = current[segment];
    }
  }
  return current;
}

export function workflowFunctionTestHasPath(
  value: JsonValue,
  path: WorkflowFunctionTestPath
): boolean {
  if (path.length === 0) return true;
  const parent = workflowFunctionTestValueAtPath(value, path.slice(0, -1));
  const key = path.at(-1)!;
  return typeof key === "number"
    ? Array.isArray(parent) && key >= 0 && key < parent.length
    : Boolean(
        parent && typeof parent === "object" && !Array.isArray(parent) && Object.hasOwn(parent, key)
      );
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function setWorkflowFunctionTestValue(
  source: JsonValue,
  path: WorkflowFunctionTestPath,
  nextValue: JsonValue
): JsonValue {
  if (path.length === 0) return cloneJson(nextValue);
  const root = cloneJson(source);
  let current: JsonValue = root;

  path.forEach((segment, index) => {
    const last = index === path.length - 1;
    const nextSegment = path[index + 1];
    if (typeof segment === "number") {
      if (!Array.isArray(current))
        throw new TypeError("Function test path does not resolve to an array.");
      if (last) {
        current[segment] = cloneJson(nextValue);
        return;
      }
      const child = current[segment];
      if (!child || typeof child !== "object") {
        current[segment] = typeof nextSegment === "number" ? [] : {};
      }
      current = current[segment]!;
      return;
    }

    if (!current || typeof current !== "object" || Array.isArray(current)) {
      throw new TypeError("Function test path does not resolve to an object.");
    }
    if (last) {
      current[segment] = cloneJson(nextValue);
      return;
    }
    const child = current[segment];
    if (!child || typeof child !== "object") {
      current[segment] = typeof nextSegment === "number" ? [] : {};
    }
    current = current[segment]!;
  });

  return root;
}

export function removeWorkflowFunctionTestValue(
  source: JsonValue,
  path: WorkflowFunctionTestPath
): JsonValue {
  if (path.length === 0) return null;
  const root = cloneJson(source);
  const parentPath = path.slice(0, -1);
  const parent = workflowFunctionTestValueAtPath(root, parentPath);
  const key = path.at(-1)!;
  if (typeof key === "number") {
    if (Array.isArray(parent)) parent.splice(key, 1);
  } else if (parent && typeof parent === "object" && !Array.isArray(parent)) {
    delete parent[key];
  }
  return root;
}
