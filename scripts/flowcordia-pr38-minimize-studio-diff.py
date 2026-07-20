from pathlib import Path
import subprocess

path = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudio.tsx"
source = subprocess.check_output(["git", "show", f"origin/main:{path}"], text=True)

root = '    <ResizablePanelGroup orientation="horizontal" className="h-full max-h-full">'
root_with_contract = '''    <ResizablePanelGroup
      data-testid="flowcordia-workflow-studio"
      data-workflow-id={selectedWorkflowId ?? ""}
      data-draft-present={draft ? "true" : "false"}
      data-draft-version={draft?.version ?? ""}
      data-preview-state={preview.state}
      data-proposal-head={preview.proposal?.headSha ?? ""}
      data-deployment-version={preview.deployment?.version ?? ""}
      data-run-id={preview.latestRun?.friendlyId ?? ""}
      data-run-status={preview.latestRun?.status ?? ""}
      data-run-proof={preview.latestRun?.proof ?? ""}
      orientation="horizontal"
      className="h-full max-h-full"
    >'''
if source.count(root) != 1:
    raise SystemExit(f"expected one Studio root, found {source.count(root)}")
source = source.replace(root, root_with_contract, 1)

preview = '''            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-xs",
                previewTone(preview.state)
              )}
            >'''
preview_with_contract = '''            <div
              data-testid="flowcordia-preview-status"
              data-state={preview.state}
              data-proposal-head={preview.proposal?.headSha ?? ""}
              data-run-status={preview.latestRun?.status ?? ""}
              data-run-proof={preview.latestRun?.proof ?? ""}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-xs",
                previewTone(preview.state)
              )}
            >'''
if source.count(preview) != 1:
    raise SystemExit(f"expected one preview status block, found {source.count(preview)}")
source = source.replace(preview, preview_with_contract, 1)

if source.count('data-testid="flowcordia-workflow-studio"') != 1:
    raise SystemExit("Studio acceptance root must exist exactly once")
if source.count('data-testid="flowcordia-preview-status"') != 1:
    raise SystemExit("Preview acceptance status must exist exactly once")
if '<div\n      data-testid="flowcordia-workflow-studio"' in source:
    raise SystemExit("Acceptance contract must not wrap and reindent the Studio tree")

Path(path).write_text(source)
print("PR38 Studio diff minimization passed")
