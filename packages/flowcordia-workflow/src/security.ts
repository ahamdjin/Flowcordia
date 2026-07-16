import type { JsonValue } from "./types.js";

const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|authorization|bearer|credential|password|private[_-]?key|secret|token)/i;

function stringContainsUrlSecret(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.username || url.password) return true;
    return Array.from(url.searchParams.entries()).some(
      ([key, child]) => SECRET_KEY_PATTERN.test(key) && child.length > 0
    );
  } catch {
    return false;
  }
}

export function findInlineSecretPath(value: JsonValue, path: string[] = []): string[] | null {
  if (typeof value === "string" && stringContainsUrlSecret(value)) return path;
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findInlineSecretPath(value[index]!, [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key) && child !== null && child !== "") return [...path, key];
    const found = findInlineSecretPath(child, [...path, key]);
    if (found) return found;
  }
  return null;
}
