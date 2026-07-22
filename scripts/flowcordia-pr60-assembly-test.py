from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


path = "apps/webapp/test/flowcordia/releaseEvidenceAssembly.test.ts"
replace_once(
    path,
    '''    expect(output.sourceRuns).toHaveLength(5);\n    expect(output.sourceRuns[0]).toMatchObject({\n      stage: "preview",\n''',
    '''    expect(output.schemaVersion).toBe("0.3");\n    expect(output.sourceRuns).toHaveLength(7);\n    expect(output.sourceRuns[0]).toMatchObject({\n      stage: "provider",\n''',
)
replace_once(
    path,
    '''    const previewBytes = await readFile(join(input.evidenceRoot, "preview", "evidence.json"));\n    expect(output.sourceRuns[0]!.evidenceSha256).toBe(\n      createHash("sha256").update(previewBytes).digest("hex")\n''',
    '''    const providerBytes = await readFile(join(input.evidenceRoot, "provider", "evidence.json"));\n    expect(output.sourceRuns[0]!.evidenceSha256).toBe(\n      createHash("sha256").update(providerBytes).digest("hex")\n''',
)
replace_once(
    path,
    '''    expect(workflow).toContain('run.event !== "workflow_dispatch"');\n''',
    '''    expect(workflow).toContain("source_runs_json:");\n    expect(workflow).toContain('"provider"');\n    expect(workflow).toContain('"alert"');\n    expect(workflow).toContain("FLOWCORDIA_RELEASE_PROVIDER_RUN_ID");\n    expect(workflow).toContain("FLOWCORDIA_RELEASE_ALERT_RUN_ID");\n    expect(workflow).toContain(".github/workflows/flowcordia-provider-readiness.yml");\n    expect(workflow).toContain(".github/workflows/flowcordia-alert-readiness.yml");\n    expect(workflow).toContain("flowcordia-provider-readiness-$FLOWCORDIA_RELEASE_ID");\n    expect(workflow).toContain("flowcordia-alert-readiness-$FLOWCORDIA_RELEASE_ID");\n    expect(workflow).not.toContain("preview_run_id:");\n    expect(workflow).not.toContain("rollback_production_run_id:");\n    expect(workflow).toContain('run.event !== "workflow_dispatch"');\n''',
)
