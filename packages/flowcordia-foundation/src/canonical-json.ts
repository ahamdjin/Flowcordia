import { canonicalize as canonicalizeJcs } from "json-canonicalize";
import stableStringify from "json-stable-stringify";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface StableJsonOptions {
  space?: number | string;
  trailingNewline?: boolean;
}

/**
 * Deterministic key-sorted JSON used by Flowcordia's existing version-1 hash and signature contracts.
 * This intentionally preserves the historical ECMAScript number and escaping behavior.
 */
export function stableJsonStringify(value: unknown, options: StableJsonOptions = {}): string {
  const serialized = stableStringify(value as object, {
    ...(options.space === undefined ? {} : { space: options.space }),
  });
  if (serialized === undefined) {
    throw new TypeError("Flowcordia canonical JSON requires a JSON value.");
  }
  return options.trailingNewline ? `${serialized}\n` : serialized;
}

/**
 * RFC 8785 / JCS serialization for explicitly versioned future contracts.
 * Existing Flowcordia hashes must continue to use stableJsonStringify until migrated by version.
 */
export function jcsJsonStringify(value: unknown): string {
  return canonicalizeJcs(value);
}

export function cloneJson<Value>(value: Value): Value {
  return structuredClone(value);
}
