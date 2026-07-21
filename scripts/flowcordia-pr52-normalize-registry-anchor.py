from pathlib import Path

path = Path("flowcordia/testing/release-evidence-registry.md")
source = path.read_text()
current = """The protected **Flowcordia assemble release evidence** workflow converts five successful connected acceptance artifacts into one sanitized, immutable release manifest. It never writes to `main`. It creates a draft pull request containing exactly one versioned manifest for human review and normal repository checks.
"""
normalized = """The registry assembles five protected acceptance artifacts into one exact-lineage release manifest.
"""
if source.count(current) != 1:
    raise SystemExit("release evidence registry purpose anchor is not exact")
path.write_text(source.replace(current, normalized, 1))
