import fs from "node:fs";

const workspacePath =
  "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowSourceWorkspace.tsx";
let source = fs.readFileSync(workspacePath, "utf8");

source = source.replace(
  "  const pendingOpenNodeId = useRef<string | null>(null);",
  "  const pendingOpenNodeId = useRef<string | null>(null);\n  const allowNavigationRef = useRef(false);"
);
source = source.replace(
  "  const blocker = useBlocker(editorDirty);",
  `  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowNavigationRef.current) {
      allowNavigationRef.current = false;
      return false;
    }
    return (
      editorDirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search)
    );
  });`
);
source = source.replace(
  "      setEditorText(\"\");\n      commitNodeSelection(nextNodeId);",
  `      setEditorText("");
      allowNavigationRef.current = true;
      commitNodeSelection(nextNodeId);
      queueMicrotask(() => {
        allowNavigationRef.current = false;
      });`
);

fs.writeFileSync(workspacePath, source);
