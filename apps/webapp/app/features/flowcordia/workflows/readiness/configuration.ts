import { Buffer } from "node:buffer";

const MAX_TRIGGER_CONFIG_BYTES = 256 * 1024;

type Token = {
  type: "identifier" | "string" | "punctuation";
  value: string;
};

export type FlowcordiaTaskDiscoveryInspection = {
  state: "PASSED" | "BLOCKED";
  message: string;
};

function identifierStart(value: string): boolean {
  return /[A-Za-z_$]/.test(value);
}

function identifierPart(value: string): boolean {
  return /[A-Za-z0-9_$]/.test(value);
}

function readQuotedString(
  source: string,
  start: number,
  quote: "'" | '"'
): { value: string; next: number } | null {
  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const current = source[index]!;
    if (current === quote) return { value, next: index + 1 };
    if (current === "\\") {
      index += 1;
      if (index >= source.length) return null;
      const escaped = source[index]!;
      switch (escaped) {
        case "n":
          value += "\n";
          break;
        case "r":
          value += "\r";
          break;
        case "t":
          value += "\t";
          break;
        default:
          value += escaped;
      }
      continue;
    }
    if (current === "\n" || current === "\r") return null;
    value += current;
  }
  return null;
}

function skipTemplateLiteral(source: string, start: number): number {
  for (let index = start + 1; index < source.length; index += 1) {
    const current = source[index]!;
    if (current === "\\") {
      index += 1;
      continue;
    }
    if (current === "`") return index + 1;
  }
  return source.length;
}

function tokenize(source: string): Token[] {
  const result: Token[] = [];
  for (let index = 0; index < source.length; ) {
    const current = source[index]!;
    const next = source[index + 1];

    if (/\s/.test(current)) {
      index += 1;
      continue;
    }
    if (current === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (current === "'" || current === '"') {
      const quoted = readQuotedString(source, index, current);
      if (!quoted) {
        result.push({ type: "punctuation", value: "invalid-string" });
        break;
      }
      result.push({ type: "string", value: quoted.value });
      index = quoted.next;
      continue;
    }
    if (current === "`") {
      index = skipTemplateLiteral(source, index);
      continue;
    }
    if (identifierStart(current)) {
      let end = index + 1;
      while (end < source.length && identifierPart(source[end]!)) end += 1;
      result.push({ type: "identifier", value: source.slice(index, end) });
      index = end;
      continue;
    }
    if ("[]{}:,".includes(current)) {
      result.push({ type: "punctuation", value: current });
    }
    index += 1;
  }
  return result;
}

function normalizeDirectory(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
}

function coversGeneratedTasks(value: string): boolean {
  const normalized = normalizeDirectory(value);
  return normalized === "trigger" || normalized === "trigger/flowcordia";
}

export function inspectFlowcordiaTaskDiscovery(source: string): FlowcordiaTaskDiscoveryInspection {
  if (Buffer.byteLength(source, "utf8") > MAX_TRIGGER_CONFIG_BYTES) {
    return {
      state: "BLOCKED",
      message: "trigger.config.ts is too large to inspect safely.",
    };
  }

  const tokens = tokenize(source);
  const properties = tokens.flatMap((token, index) =>
    (token.type === "identifier" || token.type === "string") &&
    token.value === "dirs" &&
    tokens[index + 1]?.value === ":"
      ? [index]
      : []
  );

  if (properties.length === 0) {
    return {
      state: "PASSED",
      message: "Trigger.dev default task discovery includes trigger/flowcordia.",
    };
  }
  if (properties.length > 1) {
    return {
      state: "BLOCKED",
      message: "trigger.config.ts declares more than one dirs property.",
    };
  }

  const start = properties[0]! + 2;
  if (tokens[start]?.value !== "[") {
    return {
      state: "BLOCKED",
      message:
        "The dirs setting is dynamic. Use a static directory list that includes trigger or trigger/flowcordia.",
    };
  }

  const directories: string[] = [];
  let expectValue = true;
  for (let index = start + 1; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.value === "]") {
      if (directories.length === 0) {
        return { state: "BLOCKED", message: "The dirs setting cannot be empty." };
      }
      return directories.some(coversGeneratedTasks)
        ? {
            state: "PASSED",
            message: "The explicit task directories include generated Flowcordia tasks.",
          }
        : {
            state: "BLOCKED",
            message:
              "The explicit dirs setting excludes trigger/flowcordia. Include trigger or trigger/flowcordia.",
          };
    }
    if (expectValue) {
      if (token.type !== "string") {
        return {
          state: "BLOCKED",
          message:
            "The dirs setting must be a static string array that includes trigger or trigger/flowcordia.",
        };
      }
      directories.push(token.value);
      expectValue = false;
      continue;
    }
    if (token.value !== ",") {
      return {
        state: "BLOCKED",
        message: "The dirs setting is not a supported static string array.",
      };
    }
    expectValue = true;
  }

  return {
    state: "BLOCKED",
    message: "The dirs setting could not be parsed safely.",
  };
}
