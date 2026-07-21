from pathlib import Path

path = Path("packages/flowcordia-workflow/test/editor.test.ts")
content = path.read_text()
old = '''      "http_action",\n      "condition",\n'''
new = '''      "http_action",\n      "data_map",\n      "condition",\n'''
if content.count(old) != 1:
    raise SystemExit(f"expected one editor catalog anchor, found {content.count(old)}")
path.write_text(content.replace(old, new, 1))
