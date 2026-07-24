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

old_catalog_marker = '''    ''' + "'''  {\n    id: \"wait\",\n    defaultName: \"Wait\",'''" + '''
'''
new_catalog_marker = '''    ''' + "'''  {\n    id: \"wait\",\n    catalogId: \"flowcordia.logic.wait\",\n    catalogVersion: 1,\n    label: \"Wait\",\n    description: \"Pause with the inherited Trigger.dev durable-wait primitive.\",\n    category: \"logic\",\n    releaseStage: \"approved\",\n    capabilities: [\"structural_preview\", \"live_execution\", \"governed_code_generation\"],\n    kind: \"control\",\n    operation: \"control.wait\",\n    defaultName: \"Wait\",'''" + '''
'''
if text.count(old_catalog_marker) != 1:
    raise SystemExit("Expected one legacy wait catalog marker in the core builder.")
text = text.replace(old_catalog_marker, new_catalog_marker)

old_approval_entry = '''    ''' + "'''  {\n    id: \"approval\",\n    defaultName: \"Human approval\",\n    kind: \"approval\",\n    operation: \"approval.human\",'''" + '''
'''
new_approval_entry = '''    ''' + "'''  {\n    id: \"approval\",\n    catalogId: \"flowcordia.approval.human\",\n    catalogVersion: 1,\n    label: \"Human approval\",\n    description: \"Pause a live workflow until an authorized reviewer approves or rejects it.\",\n    category: \"logic\",\n    releaseStage: \"limited\",\n    capabilities: [\"structural_preview\", \"live_execution\", \"governed_code_generation\"],\n    defaultName: \"Human approval\",\n    kind: \"approval\",\n    operation: \"approval.human\",'''" + '''
'''
if text.count(old_approval_entry) != 1:
    raise SystemExit("Expected one approval catalog entry in the core builder.")
text = text.replace(old_approval_entry, new_approval_entry)

text = text.replace("\\`", "\\\\`")
path.write_text(text)
