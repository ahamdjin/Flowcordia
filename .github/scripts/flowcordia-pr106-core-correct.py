from pathlib import Path

path = Path(".github/scripts/flowcordia-pr106-core.py")
text = path.read_text()

marker = "'''  FLOWCORDIA_HTTP_BODY_MODES,\n  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,''',"
replacement = "'''  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,\n  FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH,\n  FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS,\n  FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS,\n  FLOWCORDIA_HTTP_BODY_MODES,\n  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,''',"
primary_block = (
    'replace(\n'
    '    "apps/webapp/app/features/flowcordia/workflows/studio/node-configuration.ts",\n'
    f'    {marker}\n'
    f'    {replacement}\n'
    ')\n'
)
updated_primary_block = primary_block[:-2] + '    count=2,\n)\n'
duplicate_block = primary_block[:-2] + '    count=1,\n)\n'
if text.count(primary_block) != 1:
    raise SystemExit(f"Expected one primary node-configuration patch, found {text.count(primary_block)}.")
if text.count(duplicate_block) != 1:
    raise SystemExit(f"Expected one duplicate node-configuration patch, found {text.count(duplicate_block)}.")
text = text.replace(primary_block, updated_primary_block)
text = text.replace(duplicate_block, "")

obsolete_kind_patch = """replace(
    "packages/flowcordia-workflow/src/types.ts",
    '''    subflow: ["subflow.invoke"],
    condition: ["control.condition"],''',
    '''    subflow: ["subflow.invoke"],
    approval: ["approval.human"],
    condition: ["control.condition"],''',
)
"""
if text.count(obsolete_kind_patch) != 1:
    raise SystemExit(f"Expected one obsolete node-kind patch, found {text.count(obsolete_kind_patch)}.")
text = text.replace(obsolete_kind_patch, "")

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

old_wait = '''    id: "wait",
    defaultName: "Wait",'''
new_wait = '''    id: "wait",
    catalogId: "flowcordia.logic.wait",
    catalogVersion: 1,
    label: "Wait",
    description: "Pause with the inherited Trigger.dev durable-wait primitive.",
    category: "logic",
    releaseStage: "approved",
    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],
    kind: "control",
    operation: "control.wait",
    defaultName: "Wait",'''
if text.count(old_wait) != 2:
    raise SystemExit(f"Expected two wait fragments in the core builder, found {text.count(old_wait)}.")
text = text.replace(old_wait, new_wait)

old_approval = '''    id: "approval",
    defaultName: "Human approval",
    kind: "approval",
    operation: "approval.human",'''
new_approval = '''    id: "approval",
    catalogId: "flowcordia.approval.human",
    catalogVersion: 1,
    label: "Human approval",
    description: "Pause a live workflow until an authorized reviewer approves or rejects it.",
    category: "logic",
    releaseStage: "limited",
    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],
    kind: "approval",
    operation: "approval.human",
    defaultName: "Human approval",'''
if text.count(old_approval) != 1:
    raise SystemExit(f"Expected one approval fragment in the core builder, found {text.count(old_approval)}.")
text = text.replace(old_approval, new_approval)
text = text.replace('    inputs: ["input"],\n    outputs: ["output"],\n', "")

catalog_patch = '''replace(
    "packages/flowcordia-workflow/src/catalog.ts",
    ''' + "'''  \"condition\",\n  \"wait\",'''" + ''',
    ''' + "'''  \"condition\",\n  \"approval\",\n  \"wait\",'''" + ''',
)

'''
anchor = 'replace(\n    "packages/flowcordia-workflow/src/catalog.ts",\n'
if text.count(anchor) != 1:
    raise SystemExit("Expected one catalog replacement anchor.")
text = text.replace(anchor, catalog_patch + anchor, 1)

text = text.replace("\\`", "\\\\`")
text = text.replace("\\${", "\\\\${")
path.write_text(text)
