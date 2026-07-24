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

path.write_text(text)
