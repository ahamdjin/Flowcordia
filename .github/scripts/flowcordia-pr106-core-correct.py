from pathlib import Path

path = Path(".github/scripts/flowcordia-pr106-core.py")
text = path.read_text()

block = '''replace(
    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",
    ''' + "'''  FLOWCORDIA_HTTP_BODY_MODES,\n  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,'''," + '''
    ''' + "'''  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,\n  FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH,\n  FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS,\n  FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS,\n  FLOWCORDIA_HTTP_BODY_MODES,\n  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,'''," + '''
    count=1,
)
'''
if text.count(block) != 1:
    raise SystemExit("Expected one duplicate node-configuration import patch.")
text = text.replace(block, "")

for old, new in {
    '${"${configuration.timeoutSeconds}"}': r'\${configuration.timeoutSeconds}',
    '${"${workflow.id}"}': r'\${workflow.id}',
    '${"${flowcordiaRunId}"}': r'\${flowcordiaRunId}',
    '${"${node.id}"}': r'\${node.id}',
    '${"${Math.min(configuration.timeoutSeconds + 86400, 2678400)}"}': r'\${Math.min(configuration.timeoutSeconds + 86400, 2678400)}',
}.items():
    if old not in text:
        raise SystemExit(f"Missing generated-template marker: {old}")
    text = text.replace(old, new)

old_catalog_marker = """'''  {
    id: "wait",
    defaultName: "Wait",'''"""
new_catalog_marker = """'''  {
    id: "wait",
    catalogId: "flowcordia.logic.wait",
    catalogVersion: 1,
    label: "Wait",
    description: "Pause with the inherited Trigger.dev durable-wait primitive.",
    category: "logic",
    releaseStage: "approved",
    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],
    kind: "control",
    operation: "control.wait",
    defaultName: "Wait",'''"""
if text.count(old_catalog_marker) != 1:
    raise SystemExit(f"Expected one legacy wait catalog marker, found {text.count(old_catalog_marker)}.")
text = text.replace(old_catalog_marker, new_catalog_marker)

old_approval_entry = """'''  {
    id: "approval",
    defaultName: "Human approval",
    kind: "approval",
    operation: "approval.human",'''"""
new_approval_entry = """'''  {
    id: "approval",
    catalogId: "flowcordia.approval.human",
    catalogVersion: 1,
    label: "Human approval",
    description: "Pause a live workflow until an authorized reviewer approves or rejects it.",
    category: "logic",
    releaseStage: "limited",
    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],
    defaultName: "Human approval",
    kind: "approval",
    operation: "approval.human",'''"""
if text.count(old_approval_entry) != 1:
    raise SystemExit(f"Expected one approval catalog entry, found {text.count(old_approval_entry)}.")
text = text.replace(old_approval_entry, new_approval_entry)

text = text.replace("\\`", "\\\\`")
path.write_text(text)
