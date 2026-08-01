import { createTypeScriptTools } from "@secure-exec/typescript";
import type { JsonValue } from "@flowcordia/workflow";
import { NodeRuntime } from "secure-exec";
import type { FlowcordiaSourceExecutionInput } from "./types.js";

const DEFAULT_SOURCE_TIMEOUT_MS = 5_000;
const MAX_SOURCE_TIMEOUT_MS = 30_000;

const FLOWCORDIA_SOURCE_TYPES = `
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
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
    nodeId: string;
    environment: "test" | "staging" | "production";
    runId?: string;
    attempt?: number;
  };
}
declare global {
  var __return: (value: JsonValue) => void;
}
`;

function boundedTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_SOURCE_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_SOURCE_TIMEOUT_MS) {
    throw new Error(`Source timeout must be between 1 and ${MAX_SOURCE_TIMEOUT_MS} milliseconds.`);
  }
  return Math.floor(value);
}

function compileErrorMessage(diagnostics: readonly unknown[]): string {
  const messages = diagnostics
    .slice(0, 5)
    .map((diagnostic) => {
      if (!diagnostic || typeof diagnostic !== "object") return String(diagnostic);
      const value = diagnostic as Record<string, unknown>;
      const location =
        typeof value.line === "number"
          ? ` at line ${value.line}${typeof value.column === "number" ? `:${value.column}` : ""}`
          : "";
      return `${String(value.message ?? "TypeScript compilation failed")}${location}`;
    })
    .join(" ");
  return messages || "TypeScript Source compilation failed.";
}

function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    throw new Error("TypeScript Source output must be JSON-compatible.");
  }
}

function guestInvocation(input: FlowcordiaSourceExecutionInput): string {
  const context = {
    input: input.context.input,
    steps: input.context.steps,
    variables: input.context.variables,
    execution: input.context.execution,
  };
  const credentials = input.credentials;

  return `
const __flowcordiaCredentialValues = ${JSON.stringify(credentials)};
const __flowcordiaContext = {
  ...${JSON.stringify(context)},
  credentials: {
    has(reference) {
      return Object.prototype.hasOwnProperty.call(__flowcordiaCredentialValues, reference);
    },
    async get(reference) {
      if (!Object.prototype.hasOwnProperty.call(__flowcordiaCredentialValues, reference)) {
        throw new Error(\`Credential reference "\${reference}" is not available to this Source node.\`);
      }
      return __flowcordiaCredentialValues[reference];
    },
  },
};
const __flowcordiaResult = await run(__flowcordiaContext);
globalThis.__return(__flowcordiaResult ?? null);
`;
}

export async function executeStudioV2TypeScriptSource(
  input: FlowcordiaSourceExecutionInput
): Promise<JsonValue> {
  const tools = createTypeScriptTools();
  const compiled = await tools.compileSource({
    sourceText: `${FLOWCORDIA_SOURCE_TYPES}\n${input.document.source}`,
  });
  if (!compiled.success || !compiled.outputText) {
    throw new Error(compileErrorMessage(compiled.diagnostics ?? []));
  }

  const runtime = await NodeRuntime.create({
    permissions: {
      // Secure Exec virtualizes these capabilities inside the guest kernel. They
      // must remain available for the runtime to create its in-memory filesystem
      // and launch the compiled program; they do not grant host access.
      fs: "allow",
      childProcess: "allow",
      process: "allow",
      env: "allow",
      network: "deny",
      binding: "deny",
    },
  });
  try {
    const result = await runtime.run(`${compiled.outputText}\n${guestInvocation(input)}`, {
      timeout: boundedTimeout(input.timeoutMs),
    });
    if (result.exitCode !== 0) {
      const message =
        result.stderr.trim() || result.stdout.trim() || "TypeScript Source execution failed.";
      throw new Error(message);
    }
    return toJsonValue(result.value);
  } finally {
    await runtime.dispose();
  }
}
