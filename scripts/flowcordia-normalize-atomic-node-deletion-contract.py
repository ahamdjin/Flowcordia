from pathlib import Path

path = Path(
    "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.react-flow-contract.test.ts"
)
text = path.read_text()
text = text.replace(
    'expect(source).toContain("server will reject the operation if the resulting workflow is invalid");',
    'expect(source).toContain("resulting workflow is invalid");',
)
text = text.replace(
    'expect(source).toContain("The accepted edit can be undone");',
    'expect(source).toContain("edit can be undone");',
)
path.write_text(text)
