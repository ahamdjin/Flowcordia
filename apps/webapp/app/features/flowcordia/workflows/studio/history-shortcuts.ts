export type WorkflowStudioHistoryAction = "undo" | "redo";

export function resolveWorkflowStudioHistoryShortcut(input: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): WorkflowStudioHistoryAction | null {
  if (input.altKey || (!input.metaKey && !input.ctrlKey)) return null;
  const key = input.key.toLowerCase();
  if (key === "z") return input.shiftKey ? "redo" : "undo";
  if (key === "y" && !input.shiftKey) return "redo";
  return null;
}

export function isWorkflowStudioHistoryTextEntry(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest('[contenteditable="true"]') !== null
  );
}
