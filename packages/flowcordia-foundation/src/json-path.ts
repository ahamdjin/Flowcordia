import jsonPointer from "jsonpointer";
import type { JsonValue } from "./canonical-json.js";

const UNSAFE_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

export interface DotPathPolicy {
  allowRoot?: boolean;
  allowArrayIndexes?: boolean;
  maxLength?: number;
  maxSegments?: number;
  segmentPattern?: RegExp;
}

export type DotPathResult =
  | { success: true; path: string; segments: readonly string[]; pointer: string }
  | { success: false; reason: "invalid_type" | "invalid_path" | "unsafe_path" };

function pointerEscape(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function parseDotPath(path: unknown, policy: DotPathPolicy = {}): DotPathResult {
  if (typeof path !== "string") return { success: false, reason: "invalid_type" };
  const normalized = path.trim();
  if (normalized === "" && policy.allowRoot) {
    return { success: true, path: "", segments: [], pointer: "" };
  }
  const segments = normalized.split(".");
  const maxLength = policy.maxLength ?? 512;
  const maxSegments = policy.maxSegments ?? 32;
  const defaultPattern = policy.allowArrayIndexes
    ? /^(?:[A-Za-z_][A-Za-z0-9_-]{0,127}|0|[1-9][0-9]{0,8})$/
    : /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/;
  const pattern = policy.segmentPattern ?? defaultPattern;
  if (
    normalized === "" ||
    normalized.length > maxLength ||
    segments.length > maxSegments ||
    segments.some((segment) => !pattern.test(segment))
  ) {
    return { success: false, reason: "invalid_path" };
  }
  if (segments.some((segment) => UNSAFE_SEGMENTS.has(segment))) {
    return { success: false, reason: "unsafe_path" };
  }
  return {
    success: true,
    path: normalized,
    segments,
    pointer: `/${segments.map(pointerEscape).join("/")}`,
  };
}

export function getJsonPointer(
  value: JsonValue,
  pointer: string
): { found: boolean; value: JsonValue } {
  if (pointer === "") return { found: true, value };
  if (value === null || typeof value !== "object") return { found: false, value: null };
  try {
    const selected = jsonPointer.get(value, pointer) as JsonValue | undefined;
    return selected === undefined
      ? { found: false, value: null }
      : { found: true, value: selected };
  } catch {
    return { found: false, value: null };
  }
}

export function getDotPath(
  value: JsonValue,
  path: string,
  policy: DotPathPolicy = { allowRoot: true, allowArrayIndexes: true }
): { found: boolean; value: JsonValue } {
  const parsed = parseDotPath(path, policy);
  if (!parsed.success) return { found: false, value: null };
  return getJsonPointer(value, parsed.pointer);
}

export function setJsonPointer(
  target: Record<string, JsonValue>,
  pointer: string,
  value: JsonValue
): void {
  if (pointer === "") throw new TypeError("Flowcordia cannot replace the mapping output root.");
  jsonPointer.set(target, pointer, structuredClone(value));
}

export function setDotPath(
  target: Record<string, JsonValue>,
  path: string,
  value: JsonValue,
  policy: DotPathPolicy = {}
): void {
  const parsed = parseDotPath(path, policy);
  if (!parsed.success) throw new TypeError("Flowcordia target path is invalid.");
  setJsonPointer(target, parsed.pointer, value);
}
