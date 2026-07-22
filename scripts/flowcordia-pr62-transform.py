from pathlib import Path

path = Path("apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudio.tsx")
text = path.read_text()

old_import = '''import {
  WORKFLOW_STUDIO_NODE_CATALOG,
  type WorkflowEditCommand,
  type WorkflowStudioNodeCapability,
  type WorkflowStudioNodeCatalogCategory,
  type WorkflowStudioTemplateId,
} from "@flowcordia/workflow";'''
new_import = '''import {
  type WorkflowEditCommand,
  type WorkflowStudioTemplateId,
} from "@flowcordia/workflow";'''
if text.count(old_import) != 1:
    raise SystemExit("unexpected Flowcordia workflow import shape")
text = text.replace(old_import, new_import)

old_constants = '''const CATALOG_CATEGORIES: readonly {
  id: WorkflowStudioNodeCatalogCategory;
  label: string;
}[] = [
  { id: "trigger", label: "Triggers" },
  { id: "action", label: "Actions" },
  { id: "logic", label: "Logic" },
  { id: "output", label: "Output" },
];

const CATALOG_CAPABILITY_LABELS: Record<WorkflowStudioNodeCapability, string> = {
  structural_preview: "Structural preview",
  live_execution: "Live execution",
  credential_references: "Credentials",
  governed_code_generation: "Generated code",
  production_binding: "Production binding",
};

'''
if text.count(old_constants) != 1:
    raise SystemExit("unexpected inline catalog constants")
text = text.replace(old_constants, "")

anchor_import = 'import { WorkflowStudioNodeConfigurationEditor } from "./WorkflowStudioNodeConfigurationEditor";\n'
new_picker_import = (
    anchor_import
    + 'import { WorkflowStudioNodeCatalogPicker } from "./WorkflowStudioNodeCatalogPicker";\n'
)
if text.count(anchor_import) != 1:
    raise SystemExit("unexpected node configuration import")
text = text.replace(anchor_import, new_picker_import)

old_selection = '''  const selectedTemplate =
    WORKFLOW_STUDIO_NODE_CATALOG.find((template) => template.id === templateId) ??
    WORKFLOW_STUDIO_NODE_CATALOG[0]!;
'''
if text.count(old_selection) != 1:
    raise SystemExit("unexpected selected template projection")
text = text.replace(old_selection, "")

start_marker = '''                {draft && (
                  <>
                    <div className="w-full max-w-64">'''
end_marker = '''                  </>
                )}
'''
start = text.find(start_marker)
if start < 0:
    raise SystemExit("catalog toolbar start marker missing")
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit("catalog toolbar end marker missing")
end += len(end_marker)
replacement = '''                <WorkflowStudioNodeCatalogPicker
                  selectedTemplateId={templateId}
                  disabled={!editable || draftBusy}
                  busy={draftBusy}
                  onSelect={setTemplateId}
                  onAdd={addNode}
                />
'''
text = text[:start] + replacement + text[end:]

for forbidden in [
    "CATALOG_CATEGORIES",
    "CATALOG_CAPABILITY_LABELS",
    "selectedTemplate.description",
]:
    if forbidden in text:
        raise SystemExit(f"stale catalog ownership remains: {forbidden}")
if text.count("<WorkflowStudioNodeCatalogPicker") != 1:
    raise SystemExit("picker composition is not singular")
if text.count('type: "add_node"') != 1:
    raise SystemExit("existing add-node command ownership changed")

path.write_text(text)
