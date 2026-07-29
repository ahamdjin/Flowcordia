from pathlib import Path

path = Path("apps/webapp/app/features/flowcordia/workflows/studio/WorkflowSourceWorkspace.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one marker, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    'import { Link, useFetcher, useRevalidator, useSearchParams } from "@remix-run/react";',
    '''import {
  Link,
  useBeforeUnload,
  useBlocker,
  useFetcher,
  useRevalidator,
  useSearchParams,
} from "@remix-run/react";''',
    "Remix safety imports",
)
replace_once(
    'import { useEffect, useMemo, useRef, useState } from "react";',
    '''import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";''',
    "React safety imports",
)
replace_once(
    'import { Button } from "~/components/primitives/Buttons";\nimport { cn } from "~/utils/cn";',
    '''import { Button } from "~/components/primitives/Buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/primitives/Dialog";
import { cn } from "~/utils/cn";''',
    "Dialog imports",
)
replace_once(
    '} from "./presentation";\nimport type { WorkflowStudioSourceBuffer } from "./source-presentation";',
    '''} from "./presentation";
import { isSourceEditorSaveShortcut, sourceEditorSelectionDecision } from "./source-editor-safety";
import type { WorkflowStudioSourceBuffer } from "./source-presentation";''',
    "Safety helper import",
)
replace_once(
    '  const pendingOpenNodeId = useRef<string | null>(null);\n  const sourceNodes = useMemo(',
    '  const pendingOpenNodeId = useRef<string | null>(null);\n  const allowNavigationRef = useRef(false);\n  const sourceNodes = useMemo(',
    "Navigation escape state",
)
replace_once(
    '  const [lastProposal, setLastProposal] = useState<SourceCommandResponse["proposal"] | null>(null);\n  const editorExtensions = useMemo(() => {',
    '  const [lastProposal, setLastProposal] = useState<SourceCommandResponse["proposal"] | null>(null);\n  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);\n  const editorExtensions = useMemo(() => {',
    "Pending source selection state",
)
replace_once(
    '''  }, [sourceNodes, sourceQuery]);

  useEffect(() => {''',
    '''  }, [sourceNodes, sourceQuery]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowNavigationRef.current) {
      allowNavigationRef.current = false;
      return false;
    }
    return (
      editorDirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search)
    );
  });
  const pendingNode = sourceNodes.find((node) => node.id === pendingNodeId) ?? null;
  const guardOpen = Boolean(pendingNodeId || blocker.state === "blocked");

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!editorDirty) return;
        event.preventDefault();
        event.returnValue = "";
      },
      [editorDirty]
    )
  );

  useEffect(() => {''',
    "Route and unload guards",
)
replace_once(
    '''  const selectNode = (node: WorkflowStudioNode) => {
    const next = new URLSearchParams(searchParams);
    next.set("node", node.id);
    setSearchParams(next, { replace: true });
  };''',
    '''  const commitNodeSelection = (nodeId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("node", nodeId);
    setSearchParams(next, { replace: true });
  };

  const selectNode = (node: WorkflowStudioNode) => {
    if (busy) return;
    const decision = sourceEditorSelectionDecision({
      currentNodeId: selectedNode?.id ?? null,
      nextNodeId: node.id,
      dirty: editorDirty,
    });
    if (decision === "noop") return;
    if (decision === "confirm") {
      setPendingNodeId(node.id);
      return;
    }
    commitNodeSelection(node.id);
  };''',
    "Guarded source selection",
)
replace_once(
    '    if (!openedSource || !editable || !editorDirty) return;',
    '    if (!openedSource || !editable || !editorDirty || busy) return;',
    "Busy-safe source save",
)
replace_once(
    '''  const publish = () => {
    if (!draft || !editable || editorDirty) return;
    submit({
      operation: "publish",
      draftId: draft.publicId,
      expectedVersion: draft.version,
      expectedSources: changedSources.map((source) => ({
        publicId: source.publicId,
        version: source.version,
        sourceSha256: source.sourceSha256,
      })),
    });
  };

  return (''',
    '''  const publish = () => {
    if (!draft || !editable || editorDirty) return;
    submit({
      operation: "publish",
      draftId: draft.publicId,
      expectedVersion: draft.version,
      expectedSources: changedSources.map((source) => ({
        publicId: source.publicId,
        version: source.version,
        sourceSha256: source.sourceSha256,
      })),
    });
  };

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      !isSourceEditorSaveShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    saveSource();
  };

  const cancelGuard = () => {
    setPendingNodeId(null);
    if (blocker.state === "blocked") blocker.reset();
  };

  const discardAndContinue = () => {
    if (pendingNodeId) {
      const nextNodeId = pendingNodeId;
      setPendingNodeId(null);
      setOpenedSource(null);
      setEditorText("");
      allowNavigationRef.current = true;
      commitNodeSelection(nextNodeId);
      queueMicrotask(() => {
        allowNavigationRef.current = false;
      });
      return;
    }
    if (blocker.state === "blocked") blocker.proceed();
  };

  return (
    <>''',
    "Source safety handlers and fragment",
)
replace_once(
    '''                <button
                  key={node.id}
                  type="button"
                  onClick={() => selectNode(node)}
                  className={cn(
                    "group w-full rounded-lg border p-2.5 text-left transition",''',
    '''                <button
                  key={node.id}
                  type="button"
                  disabled={busy}
                  onClick={() => selectNode(node)}
                  className={cn(
                    "group w-full rounded-lg border p-2.5 text-left transition disabled:cursor-wait disabled:opacity-60",''',
    "Busy-safe source list",
)
replace_once(
    '<div className="min-h-[500px] flex-1 p-2.5 sm:p-3">\n              <CodeMirror',
    '<div className="min-h-[500px] flex-1 p-2.5 sm:p-3" onKeyDownCapture={handleEditorKeyDown}>\n              <CodeMirror',
    "Editor save shortcut boundary",
)
replace_once(
    ''': stale || draft?.stale
                ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
                : editorDirty''',
    ''': stale || draft?.stale
                ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
                : busy && openedSource
                  ? "border-indigo-400/30 bg-indigo-400/10 text-indigo-200"
                  : editorDirty''',
    "Saving state tone",
)
replace_once(
    ''': stale || draft?.stale
              ? "Repository moved"
              : editorDirty''',
    ''': stale || draft?.stale
              ? "Repository moved"
              : busy && openedSource
                ? "Saving source"
                : editorDirty''',
    "Saving state label",
)
replace_once(
    '''              <span>{editable ? "Editable draft" : "Read only"}</span>
              {editorDirty && <span className="text-amber-300">Unsaved</span>}''',
    '''              <span>{editable ? "Editable draft" : "Read only"}</span>
              {busy && openedSource ? (
                <span className="text-indigo-300">Saving</span>
              ) : editorDirty ? (
                <span className="text-amber-300">Unsaved</span>
              ) : openedSource ? (
                <span className="text-emerald-300">Saved</span>
              ) : null}''',
    "Footer save state",
)
replace_once(
    '''    </section>
  );
}''',
    '''      </section>
      <Dialog
        open={guardOpen}
        onOpenChange={(open) => {
          if (!open) cancelGuard();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unsaved source changes?</DialogTitle>
            <DialogDescription>
              {pendingNode
                ? `Switching to ${pendingNode.name} will discard the browser-only text in this editor.`
                : "Leaving this source workspace will discard the browser-only text in this editor."}
              {" "}Unsaved browser text is never sent to GitHub.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary/small" onClick={cancelGuard}>
              Keep editing
            </Button>
            <Button variant="danger/small" onClick={discardAndContinue}>
              Discard and continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}''',
    "Accessible discard confirmation",
)

path.write_text(text)
