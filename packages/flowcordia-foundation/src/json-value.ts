export type JsonCompatibilityIssueCode = "circular_reference" | "unsupported_value";

export interface JsonCompatibilityIssue {
  code: JsonCompatibilityIssueCode;
  path: ReadonlyArray<string | number>;
  valueType: string;
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function plainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function findJsonCompatibilityIssue(value: unknown): JsonCompatibilityIssue | null {
  const ancestors = new Set<object>();

  const visit = (
    candidate: unknown,
    path: ReadonlyArray<string | number>
  ): JsonCompatibilityIssue | null => {
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean" ||
      (typeof candidate === "number" && Number.isFinite(candidate))
    ) {
      return null;
    }

    if (!candidate || typeof candidate !== "object") {
      return { code: "unsupported_value", path, valueType: valueType(candidate) };
    }

    if (ancestors.has(candidate)) {
      return { code: "circular_reference", path, valueType: valueType(candidate) };
    }

    if (!Array.isArray(candidate) && !plainObject(candidate)) {
      return {
        code: "unsupported_value",
        path,
        valueType: candidate.constructor?.name ?? "object",
      };
    }

    ancestors.add(candidate);
    const issue = Array.isArray(candidate)
      ? candidate.reduce<JsonCompatibilityIssue | null>(
          (found, child, index) => found ?? visit(child, [...path, index]),
          null
        )
      : Object.entries(candidate).reduce<JsonCompatibilityIssue | null>(
          (found, [key, child]) => found ?? visit(child, [...path, key]),
          null
        );
    ancestors.delete(candidate);
    return issue;
  };

  return visit(value, []);
}
