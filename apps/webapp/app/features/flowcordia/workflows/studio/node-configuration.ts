import {
  FLOWCORDIA_HTTP_BODY_MODES,
  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,
  FLOWCORDIA_HTTP_MAX_TIMEOUT_SECONDS,
  FLOWCORDIA_HTTP_METHODS,
  FLOWCORDIA_HTTP_RESPONSE_MODES,
  parseFlowcordiaHttpConfiguration,
  type FlowcordiaHttpBodyMode,
  type FlowcordiaHttpMethod,
  type FlowcordiaHttpResponseMode,
  type JsonObject,
  type JsonValue,
} from "@flowcordia/workflow";

export {
  FLOWCORDIA_HTTP_BODY_MODES,
  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,
  FLOWCORDIA_HTTP_MAX_TIMEOUT_SECONDS,
  FLOWCORDIA_HTTP_METHODS,
  FLOWCORDIA_HTTP_RESPONSE_MODES,
};
export const FLOWCORDIA_WEBHOOK_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const FLOWCORDIA_CONDITION_OPERATORS = ["equals", "not_equals", "exists"] as const;
export const FLOWCORDIA_WAIT_UNITS = ["seconds", "minutes", "hours", "days"] as const;

type WebhookMethod = (typeof FLOWCORDIA_WEBHOOK_METHODS)[number];
type ConditionOperator = (typeof FLOWCORDIA_CONDITION_OPERATORS)[number];
export type WorkflowStudioWaitUnit = (typeof FLOWCORDIA_WAIT_UNITS)[number];
export type WorkflowStudioConditionValueType = "string" | "number" | "boolean" | "null";

export type WorkflowStudioNodeConfigurationDraft =
  | {
      kind: "empty";
      operation: "trigger.manual" | "trigger.api" | "output.return";
    }
  | { kind: "schedule"; cron: string; timezone: string }
  | { kind: "webhook"; method: WebhookMethod; path: string }
  | {
      kind: "http";
      method: FlowcordiaHttpMethod;
      url: string;
      bodyMode: FlowcordiaHttpBodyMode;
      responseMode: FlowcordiaHttpResponseMode;
      timeoutSeconds: string;
      maxResponseBytes: string;
    }
  | { kind: "wait"; duration: string; unit: WorkflowStudioWaitUnit }
  | {
      kind: "condition";
      path: string;
      operator: ConditionOperator;
      valueType: WorkflowStudioConditionValueType;
      valueText: string;
      booleanValue: boolean;
    }
  | { kind: "blocked"; message: string };

export type WorkflowStudioNodeConfigurationResult =
  | { success: true; configuration: JsonObject }
  | { success: false; message: string };

const WAIT_MULTIPLIERS: Record<WorkflowStudioWaitUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3_600,
  days: 86_400,
};

function unknownKeys(configuration: JsonObject, allowed: readonly string[]): string[] {
  const known = new Set(allowed);
  return Object.keys(configuration).filter((key) => !known.has(key));
}

function blocked(message: string): WorkflowStudioNodeConfigurationDraft {
  return { kind: "blocked", message };
}

function requiresKnownKeys(
  configuration: JsonObject,
  allowed: readonly string[]
): WorkflowStudioNodeConfigurationDraft | null {
  const unknown = unknownKeys(configuration, allowed);
  return unknown.length > 0
    ? blocked(
        `This node contains advanced configuration (${unknown.join(", ")}) that Studio will not rewrite.`
      )
    : null;
}

function isOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === "string" && values.includes(value as Value);
}

function conditionValueDraft(
  value: JsonValue | undefined
): Pick<
  Extract<WorkflowStudioNodeConfigurationDraft, { kind: "condition" }>,
  "valueType" | "valueText" | "booleanValue"
> | null {
  if (value === null) return { valueType: "null", valueText: "", booleanValue: false };
  if (typeof value === "string") {
    return { valueType: "string", valueText: value, booleanValue: false };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { valueType: "number", valueText: String(value), booleanValue: false };
  }
  if (typeof value === "boolean") {
    return { valueType: "boolean", valueText: "", booleanValue: value };
  }
  return null;
}

function waitDraft(
  durationSeconds: number
): Extract<WorkflowStudioNodeConfigurationDraft, { kind: "wait" }> {
  const units: readonly WorkflowStudioWaitUnit[] = ["days", "hours", "minutes", "seconds"];
  const unit =
    durationSeconds === 0
      ? "seconds"
      : (units.find((candidate) => durationSeconds % WAIT_MULTIPLIERS[candidate] === 0) ??
        "seconds");
  return {
    kind: "wait",
    duration: String(durationSeconds / WAIT_MULTIPLIERS[unit]),
    unit,
  };
}

export function createWorkflowStudioNodeConfigurationDraft(
  operation: string,
  configuration: JsonObject
): WorkflowStudioNodeConfigurationDraft {
  switch (operation) {
    case "trigger.manual":
    case "trigger.api":
    case "output.return": {
      const unsupported = requiresKnownKeys(configuration, []);
      return unsupported ?? { kind: "empty", operation };
    }
    case "trigger.schedule": {
      const unsupported = requiresKnownKeys(configuration, ["cron", "timezone"]);
      if (unsupported) return unsupported;
      if (typeof configuration.cron !== "string" || typeof configuration.timezone !== "string") {
        return blocked(
          "The stored schedule configuration is invalid and must be corrected in code."
        );
      }
      return { kind: "schedule", cron: configuration.cron, timezone: configuration.timezone };
    }
    case "trigger.webhook": {
      const unsupported = requiresKnownKeys(configuration, ["method", "path"]);
      if (unsupported) return unsupported;
      const method = String(configuration.method ?? "").toUpperCase();
      if (!isOneOf(method, FLOWCORDIA_WEBHOOK_METHODS) || typeof configuration.path !== "string") {
        return blocked(
          "The stored webhook configuration is invalid and must be corrected in code."
        );
      }
      return { kind: "webhook", method, path: configuration.path };
    }
    case "action.http": {
      const editableEmptyUrl =
        typeof configuration.url === "string" && configuration.url.trim().length === 0;
      const parsed = parseFlowcordiaHttpConfiguration(
        editableEmptyUrl
          ? { ...configuration, url: "https://flowcordia.invalid/configure-before-running" }
          : configuration
      );
      if (!parsed.success) {
        return blocked(
          parsed.issues[0]?.message ??
            "The stored HTTP configuration is invalid and must be corrected in code."
        );
      }
      return {
        kind: "http",
        method: parsed.configuration.method,
        url: editableEmptyUrl ? String(configuration.url) : parsed.configuration.url,
        bodyMode: parsed.configuration.bodyMode,
        responseMode: parsed.configuration.responseMode,
        timeoutSeconds: String(parsed.configuration.timeoutSeconds),
        maxResponseBytes: String(parsed.configuration.maxResponseBytes),
      };
    }
    case "control.wait": {
      const unsupported = requiresKnownKeys(configuration, ["durationSeconds"]);
      if (unsupported) return unsupported;
      if (
        typeof configuration.durationSeconds !== "number" ||
        !Number.isFinite(configuration.durationSeconds) ||
        configuration.durationSeconds < 0
      ) {
        return blocked("The stored wait duration is invalid and must be corrected in code.");
      }
      return waitDraft(configuration.durationSeconds);
    }
    case "control.condition": {
      const unsupported = requiresKnownKeys(configuration, ["path", "operator", "value"]);
      if (unsupported) return unsupported;
      if (
        typeof configuration.path !== "string" ||
        !isOneOf(configuration.operator, FLOWCORDIA_CONDITION_OPERATORS)
      ) {
        return blocked(
          "The stored condition configuration is invalid and must be corrected in code."
        );
      }
      const value =
        configuration.operator === "exists"
          ? { valueType: "null" as const, valueText: "", booleanValue: false }
          : conditionValueDraft(configuration.value);
      if (!value) {
        return blocked(
          "Studio edits condition comparison values only when they are strings, numbers, booleans, or null. Preserve object and array comparisons in code."
        );
      }
      return {
        kind: "condition",
        path: configuration.path,
        operator: configuration.operator,
        ...value,
      };
    }
    default:
      return blocked(`Operation "${operation}" does not have a safe visual configuration form.`);
  }
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function buildWorkflowStudioNodeConfiguration(
  draft: WorkflowStudioNodeConfigurationDraft
): WorkflowStudioNodeConfigurationResult {
  switch (draft.kind) {
    case "blocked":
      return { success: false, message: draft.message };
    case "empty":
      return { success: true, configuration: {} };
    case "schedule": {
      const cron = draft.cron.trim();
      const timezone = draft.timezone.trim();
      if (!cron || cron.length > 256 || cron.split(/\s+/).length !== 5) {
        return { success: false, message: "Use a bounded five-field cron expression." };
      }
      if (!timezone || timezone.length > 128 || !validTimezone(timezone)) {
        return {
          success: false,
          message: "Use a valid IANA timezone such as UTC or Asia/Karachi.",
        };
      }
      return { success: true, configuration: { cron, timezone } };
    }
    case "webhook": {
      const path = draft.path.trim();
      if (!path.startsWith("/") || path.length > 512) {
        return {
          success: false,
          message: "Webhook paths must start with / and stay under 512 characters.",
        };
      }
      return { success: true, configuration: { method: draft.method, path } };
    }
    case "http": {
      const parsed = parseFlowcordiaHttpConfiguration({
        method: draft.method,
        url: draft.url,
        bodyMode: draft.bodyMode,
        responseMode: draft.responseMode,
        timeoutSeconds: Number(draft.timeoutSeconds),
        maxResponseBytes: Number(draft.maxResponseBytes),
      });
      return parsed.success
        ? { success: true, configuration: parsed.configuration }
        : {
            success: false,
            message: parsed.issues[0]?.message ?? "The HTTP configuration is invalid.",
          };
    }
    case "wait": {
      const duration = Number(draft.duration);
      if (!Number.isFinite(duration) || duration < 0) {
        return { success: false, message: "Wait duration must be a non-negative number." };
      }
      const durationSeconds = duration * WAIT_MULTIPLIERS[draft.unit];
      if (!Number.isFinite(durationSeconds)) {
        return { success: false, message: "Wait duration is too large." };
      }
      return { success: true, configuration: { durationSeconds } };
    }
    case "condition": {
      const path = draft.path.trim();
      if (path.length > 512) {
        return { success: false, message: "Condition paths must stay under 512 characters." };
      }
      if (draft.operator === "exists") {
        return { success: true, configuration: { path, operator: draft.operator } };
      }
      let value: JsonValue;
      switch (draft.valueType) {
        case "string":
          value = draft.valueText;
          break;
        case "number": {
          const numberValue = Number(draft.valueText);
          if (!Number.isFinite(numberValue) || draft.valueText.trim().length === 0) {
            return { success: false, message: "Comparison value must be a finite number." };
          }
          value = numberValue;
          break;
        }
        case "boolean":
          value = draft.booleanValue;
          break;
        case "null":
          value = null;
          break;
      }
      return { success: true, configuration: { path, operator: draft.operator, value } };
    }
  }
}
