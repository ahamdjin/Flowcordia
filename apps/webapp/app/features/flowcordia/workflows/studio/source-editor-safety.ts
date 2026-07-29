export type SourceEditorSelectionDecision = "noop" | "select" | "confirm";

export function sourceEditorSelectionDecision({
  currentNodeId,
  nextNodeId,
  dirty,
}: {
  currentNodeId: string | null;
  nextNodeId: string;
  dirty: boolean;
}): SourceEditorSelectionDecision {
  if (currentNodeId === nextNodeId) return "noop";
  return dirty ? "confirm" : "select";
}

export function isSourceEditorSaveShortcut({
  key,
  metaKey,
  ctrlKey,
  altKey,
}: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  return !altKey && (metaKey || ctrlKey) && key.toLowerCase() === "s";
}
