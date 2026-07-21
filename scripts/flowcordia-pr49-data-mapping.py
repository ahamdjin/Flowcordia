from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


replace_once(
    "packages/flowcordia-workflow/src/index.ts",
    'export * from "./migrations.js";\n',
    'export * from "./mapping.js";\nexport * from "./migrations.js";\n',
)

catalog = "packages/flowcordia-workflow/src/catalog.ts"
replace_once(catalog, '  "http_action",\n  "condition",\n', '  "http_action",\n  "data_map",\n  "condition",\n')
replace_once(
    catalog,
    '''  {\n    id: "condition",\n''',
    '''  {\n    id: "data_map",\n    catalogId: "flowcordia.data.map",\n    catalogVersion: 1,\n    label: "Map data",\n    description: "Reshape reviewed JSON through safe source paths and scalar literals.",\n    category: "logic",\n    releaseStage: "approved",\n    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],\n    kind: "control",\n    operation: "data.map",\n    defaultName: "Map data",\n    defaultConfiguration: { mode: "replace", entries: [] },\n  },\n  {\n    id: "condition",\n''',
)

editor = "packages/flowcordia-workflow/src/editor.ts"
replace_once(
    editor,
    'import { parseFlowcordiaHttpConfiguration } from "./http.js";\n',
    'import { parseFlowcordiaHttpConfiguration } from "./http.js";\nimport { parseFlowcordiaMappingConfiguration } from "./mapping.js";\n',
)
replace_once(
    editor,
    '''      if (node.operation === "action.http") {\n        const parsed = parseFlowcordiaHttpConfiguration(command.configuration);\n        if (!parsed.success) {\n          return failure(\n            "invalid_result",\n            parsed.issues[0]?.message ?? "The HTTP configuration is invalid."\n          );\n        }\n        node.configuration = parsed.configuration;\n      } else {\n        node.configuration = JSON.parse(JSON.stringify(command.configuration)) as JsonObject;\n      }\n''',
    '''      if (node.operation === "action.http") {\n        const parsed = parseFlowcordiaHttpConfiguration(command.configuration);\n        if (!parsed.success) {\n          return failure(\n            "invalid_result",\n            parsed.issues[0]?.message ?? "The HTTP configuration is invalid."\n          );\n        }\n        node.configuration = parsed.configuration;\n      } else if (node.operation === "data.map") {\n        const parsed = parseFlowcordiaMappingConfiguration(command.configuration);\n        if (!parsed.success) {\n          return failure(\n            "invalid_result",\n            parsed.issues[0]?.message ?? "The mapping configuration is invalid."\n          );\n        }\n        node.configuration = parsed.configuration;\n      } else {\n        node.configuration = JSON.parse(JSON.stringify(command.configuration)) as JsonObject;\n      }\n''',
)

analyze = "packages/flowcordia-runtime/src/analyze.ts"
replace_once(
    analyze,
    '  parseFlowcordiaHttpConfiguration,\n',
    '  parseFlowcordiaHttpConfiguration,\n  parseFlowcordiaMappingConfiguration,\n',
)
replace_once(analyze, '  "action.http",\n  "control.condition",\n', '  "action.http",\n  "data.map",\n  "control.condition",\n')
replace_once(
    analyze,
    '''    case "control.wait":\n''',
    '''    case "data.map": {\n      const mappingConfiguration = parseFlowcordiaMappingConfiguration(config);\n      if (!mappingConfiguration.success) {\n        return {\n          code: "invalid_configuration",\n          nodeId,\n          message:\n            mappingConfiguration.issues[0]?.message ?? "Data mapping configuration is invalid.",\n        };\n      }\n      break;\n    }\n    case "control.wait":\n''',
)

runtime = "packages/flowcordia-runtime/src/runtime.ts"
replace_once(
    runtime,
    '  createWorkflowFunctionPreviewValue,\n',
    '  applyFlowcordiaMapping,\n  createWorkflowFunctionPreviewValue,\n',
)
replace_once(
    runtime,
    '  parseFlowcordiaHttpConfiguration,\n',
    '  parseFlowcordiaHttpConfiguration,\n  parseFlowcordiaMappingConfiguration,\n',
)
replace_once(
    runtime,
    '''    case "control.wait":\n      await adapters.wait({ node, durationSeconds: Number(node.configuration.durationSeconds) });\n      return value;\n''',
    '''    case "data.map": {\n      const parsed = parseFlowcordiaMappingConfiguration(node.configuration);\n      if (!parsed.success) {\n        throw new Error(parsed.issues[0]?.message ?? "Data mapping configuration is invalid.");\n      }\n      const mapped = applyFlowcordiaMapping(parsed.configuration, value);\n      if (!mapped.success) throw new Error(mapped.message);\n      return mapped.value;\n    }\n    case "control.wait":\n      await adapters.wait({ node, durationSeconds: Number(node.configuration.durationSeconds) });\n      return value;\n''',
)

presentation = "apps/webapp/app/features/flowcordia/workflows/studio/presentation.ts"
replace_once(
    presentation,
    '  "control.condition": ["path", "operator", "value"],\n',
    '  "data.map": ["mode", "entries"],\n  "control.condition": ["path", "operator", "value"],\n',
)

configuration_editor = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioNodeConfigurationEditor.tsx"
replace_once(
    configuration_editor,
    'import type { WorkflowStudioNode } from "./presentation";\n',
    'import { WorkflowStudioMappingEditor } from "./WorkflowStudioMappingEditor";\nimport type { WorkflowStudioNode } from "./presentation";\n',
)
replace_once(
    configuration_editor,
    '''  const unchanged =\n    result.success && configurationFingerprint(result.configuration) === sourceFingerprint;\n\n  if (draft.kind === "blocked") {\n''',
    '''  const unchanged =\n    result.success && configurationFingerprint(result.configuration) === sourceFingerprint;\n\n  if (node.operation === "data.map") {\n    return (\n      <WorkflowStudioMappingEditor\n        configuration={node.editableConfiguration ?? {}}\n        busy={busy}\n        onSave={onSave}\n      />\n    );\n  }\n\n  if (draft.kind === "blocked") {\n''',
)

command_test = "apps/webapp/test/flowcordia/workflowDraftCommandContract.test.ts"
replace_once(command_test, '        "http_action",\n        "condition",\n', '        "http_action",\n        "data_map",\n        "condition",\n')

studio_test = "apps/webapp/test/flowcordia/workflowStudioNodeConfiguration.test.ts"
replace_once(
    studio_test,
    '''  it("round-trips wait durations through human units without changing seconds", () => {\n''',
    '''  it("keeps mapping behind its dedicated bounded editor", () => {\n    const draft = createWorkflowStudioNodeConfigurationDraft("data.map", {\n      mode: "replace",\n      entries: [{ target: "customer.email", source: "contact.email", required: true }],\n    });\n    expect(draft).toEqual({\n      kind: "blocked",\n      message: 'Operation "data.map" does not have a safe visual configuration form.',\n    });\n    const source = readFileSync(\n      fileURLToPath(\n        new URL(\n          "../../app/features/flowcordia/workflows/studio/WorkflowStudioMappingEditor.tsx",\n          import.meta.url\n        )\n      ),\n      "utf8"\n    );\n    expect(source).toContain("parseFlowcordiaMappingConfiguration");\n    expect(source).toContain("No expressions");\n    expect(source).not.toContain("eval(");\n    expect(source).not.toContain("new Function");\n  });\n\n  it("round-trips wait durations through human units without changing seconds", () => {\n''',
)

catalog_test = "packages/flowcordia-workflow/test/catalog.test.ts"
replace_once(
    catalog_test,
    '''  it("labels unbound public webhooks honestly and excludes generic code tasks", () => {\n''',
    '''  it("publishes deterministic data mapping as approved logic", () => {\n    expect(workflowStudioNodeCatalogEntry("data_map")).toMatchObject({\n      catalogId: "flowcordia.data.map",\n      releaseStage: "approved",\n      category: "logic",\n      operation: "data.map",\n      capabilities: ["structural_preview", "live_execution", "governed_code_generation"],\n    });\n  });\n\n  it("labels unbound public webhooks honestly and excludes generic code tasks", () => {\n''',
)

capability = "flowcordia/product/capability-matrix.md"
replace_once(
    capability,
    '| HTTP request | Approved HTTP/API catalog node | Shared method/body/response/timeout/response-limit contract, names-only credential bindings, structural preview, deterministic code generation, exact-host allowlist, no redirects, bounded live response streaming, cancellation, and strict credential-header validation delivered |\n',
    '| HTTP request | Approved HTTP/API catalog node | Shared method/body/response/timeout/response-limit contract, names-only credential bindings, structural preview, deterministic code generation, exact-origin allowlist, no redirects, bounded live response streaming, cancellation, response cleanup, and strict credential-header validation delivered |\n| Data mapping | Deterministic map node | Safe source paths, scalar literals, required-field behavior, replace/merge modes, Studio editor, compiler validation, structural preview, and live execution delivered without expression evaluation |\n',
)

roadmap = "flowcordia/product/roadmap.md"
replace_once(
    roadmap,
    '- Support subflows, batching, parallelism, approvals, and streaming.\n',
    '- Add deterministic data mapping between visual nodes. — delivered for bounded source paths, scalar literals, merge/replace modes, structural preview, and live execution without arbitrary expressions\n- Support subflows, batching, parallelism, approvals, and streaming.\n',
)
