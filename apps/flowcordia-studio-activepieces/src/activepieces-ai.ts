export type UIMessage = {
  role: string;
  parts: unknown[];
};

export type ToolUIPart = {
  type?: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export type DynamicToolUIPart = ToolUIPart;

export function isToolUIPart(value: unknown): value is ToolUIPart {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && type.startsWith("tool-");
}

export function getToolName(part: ToolUIPart): string {
  if (typeof part.toolName === "string" && part.toolName.length > 0) {
    return part.toolName;
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  throw new Error("Tool part does not expose a name");
}
