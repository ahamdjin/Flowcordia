import type { JsonObject, JsonValue } from "./types.js";

export const FLOWCORDIA_MAPPING_MODES = ["replace", "merge"] as const;
export const FLOWCORDIA_MAPPING_MAX_ENTRIES = 64;
export const FLOWCORDIA_MAPPING_MAX_PATH_LENGTH = 512;
export const FLOWCORDIA_MAPPING_MAX_PATH_SEGMENTS = 16;

export type FlowcordiaMappingMode = (typeof FLOWCORDIA_MAPPING_MODES)[number];

export type FlowcordiaMappingEntry =
  | {
      target: string;
      source: string;
      required: boolean;
    }
  | {
      target: string;
      value: JsonValue;
    };

export interface FlowcordiaMappingConfiguration extends JsonObject {
  mode: FlowcordiaMappingMode;
  entries: FlowcordiaMappingEntry[];
}

export type FlowcordiaMappingIssueCode =
  | "invalid_type"
  | "unknown_field"
  | "invalid_mode"
  | "invalid_entries"
  | "invalid_entry"
  | "invalid_path"
  | "unsafe_path"
  | "conflicting_target";

export interface FlowcordiaMappingIssue {
  code: FlowcordiaMappingIssueCode;
  message: string;
  entryIndex?: number;
  field?: string;
}

export type FlowcordiaMappingConfigurationResult =
  | { success: true; configuration: FlowcordiaMappingConfiguration; issues: [] }
  | { success: false; issues: FlowcordiaMappingIssue[] };

export type FlowcordiaMappingExecutionResult =
  | { success: true; value: JsonValue }
  | { success: false; message: string };

const CONFIGURATION_KEYS = new Set(["mode", "entries"]);
const SOURCE_ENTRY_KEYS = new Set(["target", "source", "required"]);
const LITERAL_ENTRY_KEYS = new Set(["target", "value"]);
const TARGET_SEGMENT = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const SOURCE_SEGMENT = /^(?:[A-Za-z_][A-Za-z0-9_-]{0,63}|0|[1-9][0-9]{0,8})$/;
const UNSAFE_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function isObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (!value || typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((child) => isJsonValue(child, ancestors))
    : isObject(value) && Object.values(value).every((child) => isJsonValue(child, ancestors));
  ancestors.delete(value);
  return valid;
}

function includes<Value extends string>(values: readonly Value[], value: unknown): value is Value {
  return typeof value === "string" && values.includes(value as Value);
}

function pathSegments(
  path: unknown,
  input: { allowRoot: boolean; entryIndex: number; field: "source" | "target" }
): { success: true; path: string; segments: string[] } | { success: false; issue: FlowcordiaMappingIssue } {
  if (typeof path !== "string") {
    return {
      success: false,
      issue: {
        code: "invalid_path",
        entryIndex: input.entryIndex,
        field: input.field,
        message: `Mapping ${input.field} must be a dot-separated path.`,
      },
    };
  }
  const normalized = path.trim();
  if (normalized === "" && input.allowRoot) return { success: true, path: "", segments: [] };
  const segments = normalized.split(".");
  const segmentPattern = input.field === "target" ? TARGET_SEGMENT : SOURCE_SEGMENT;
  if (
    normalized === "" ||
    normalized.length > FLOWCORDIA_MAPPING_MAX_PATH_LENGTH ||
    segments.length > FLOWCORDIA_MAPPING_MAX_PATH_SEGMENTS ||
    segments.some((segment) => !segmentPattern.test(segment))
  ) {
    return {
      success: false,
      issue: {
        code: "invalid_path",
        entryIndex: input.entryIndex,
        field: input.field,
        message: `Mapping ${input.field} must contain at most ${FLOWCORDIA_MAPPING_MAX_PATH_SEGMENTS} safe dot-separated segments.`,
      },
    };
  }
  if (segments.some((segment) => UNSAFE_SEGMENTS.has(segment))) {
    return {
      success: false,
      issue: {
        code: "unsafe_path",
        entryIndex: input.entryIndex,
        field: input.field,
        message: `Mapping ${input.field} contains a reserved object segment.`,
      },
    };
  }
  return { success: true, path: normalized, segments };
}

function targetsConflict(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

export function parseFlowcordiaMappingConfiguration(
  input: unknown
): FlowcordiaMappingConfigurationResult {
  if (!isObject(input)) {
    return {
      success: false,
      issues: [{ code: "invalid_type", message: "Mapping configuration must be an object." }],
    };
  }

  const issues: FlowcordiaMappingIssue[] = [];
  for (const field of Object.keys(input).sort()) {
    if (!CONFIGURATION_KEYS.has(field)) {
      issues.push({
        code: "unknown_field",
        field,
        message: `Mapping configuration field "${field}" is not supported.`,
      });
    }
  }

  const mode = input.mode ?? "replace";
  if (!includes(FLOWCORDIA_MAPPING_MODES, mode)) {
    issues.push({ code: "invalid_mode", field: "mode", message: "Mapping mode must replace or merge." });
  }

  const rawEntries = input.entries;
  if (
    !Array.isArray(rawEntries) ||
    rawEntries.length < 1 ||
    rawEntries.length > FLOWCORDIA_MAPPING_MAX_ENTRIES
  ) {
    issues.push({
      code: "invalid_entries",
      field: "entries",
      message: `Mapping requires 1–${FLOWCORDIA_MAPPING_MAX_ENTRIES} entries.`,
    });
  }

  const entries: FlowcordiaMappingEntry[] = [];
  const targetPaths: string[] = [];
  if (Array.isArray(rawEntries)) {
    rawEntries.slice(0, FLOWCORDIA_MAPPING_MAX_ENTRIES).forEach((rawEntry, entryIndex) => {
      if (!isObject(rawEntry)) {
        issues.push({ code: "invalid_entry", entryIndex, message: "Mapping entry must be an object." });
        return;
      }
      const hasSource = Object.prototype.hasOwnProperty.call(rawEntry, "source");
      const hasValue = Object.prototype.hasOwnProperty.call(rawEntry, "value");
      if (hasSource === hasValue) {
        issues.push({
          code: "invalid_entry",
          entryIndex,
          message: "Mapping entry must contain exactly one source path or literal value.",
        });
        return;
      }
      const allowed = hasSource ? SOURCE_ENTRY_KEYS : LITERAL_ENTRY_KEYS;
      for (const field of Object.keys(rawEntry).sort()) {
        if (!allowed.has(field)) {
          issues.push({
            code: "unknown_field",
            entryIndex,
            field,
            message: `Mapping entry field "${field}" is not supported.`,
          });
        }
      }

      const target = pathSegments(rawEntry.target, { allowRoot: false, entryIndex, field: "target" });
      if (!target.success) {
        issues.push(target.issue);
        return;
      }
      const conflictingTarget = targetPaths.find((candidate) => targetsConflict(candidate, target.path));
      if (conflictingTarget) {
        issues.push({
          code: "conflicting_target",
          entryIndex,
          field: "target",
          message: `Mapping target "${target.path}" conflicts with "${conflictingTarget}".`,
        });
        return;
      }
      targetPaths.push(target.path);

      if (hasSource) {
        const source = pathSegments(rawEntry.source, { allowRoot: true, entryIndex, field: "source" });
        if (!source.success) {
          issues.push(source.issue);
          return;
        }
        if (rawEntry.required !== undefined && typeof rawEntry.required !== "boolean") {
          issues.push({
            code: "invalid_entry",
            entryIndex,
            field: "required",
            message: "Mapping required must be true or false.",
          });
          return;
        }
        entries.push({ target: target.path, source: source.path, required: rawEntry.required === true });
        return;
      }

      if (!isJsonValue(rawEntry.value)) {
        issues.push({
          code: "invalid_entry",
          entryIndex,
          field: "value",
          message: "Mapping literal must be valid finite JSON.",
        });
        return;
      }
      entries.push({ target: target.path, value: cloneJson(rawEntry.value) });
    });
  }

  if (issues.length > 0 || !includes(FLOWCORDIA_MAPPING_MODES, mode)) {
    return { success: false, issues };
  }
  return {
    success: true,
    issues: [],
    configuration: { mode, entries },
  };
}

function cloneJson<Value extends JsonValue>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function valueAtPath(value: JsonValue, path: string): { found: boolean; value: JsonValue } {
  if (path === "") return { found: true, value };
  let current: JsonValue = value;
  for (const segment of path.split(".")) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) {
        return { found: false, value: null };
      }
      current = current[index] ?? null;
      continue;
    }
    if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false, value: null };
    }
    current = current[segment] as JsonValue;
  }
  return { found: true, value: current };
}

function setTarget(target: JsonObject, path: string, value: JsonValue): void {
  const segments = path.split(".");
  let current = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = cloneJson(value);
      return;
    }
    const existing = current[segment];
    if (!isObject(existing)) current[segment] = {};
    current = current[segment] as JsonObject;
  });
}

export function applyFlowcordiaMapping(
  configuration: FlowcordiaMappingConfiguration,
  input: JsonValue
): FlowcordiaMappingExecutionResult {
  const output: JsonObject =
    configuration.mode === "merge"
      ? isObject(input)
        ? cloneJson(input as JsonObject)
        : {}
      : {};
  if (configuration.mode === "merge" && !isObject(input)) {
    return { success: false, message: "Merge mapping requires an object input." };
  }

  for (const entry of configuration.entries) {
    if ("value" in entry) {
      setTarget(output, entry.target, entry.value);
      continue;
    }
    const selected = valueAtPath(input, entry.source);
    if (!selected.found) {
      if (entry.required) {
        return {
          success: false,
          message: `Required mapping source "${entry.source || "<root>"}" is unavailable.`,
        };
      }
      continue;
    }
    setTarget(output, entry.target, selected.value);
  }
  return { success: true, value: output };
}
