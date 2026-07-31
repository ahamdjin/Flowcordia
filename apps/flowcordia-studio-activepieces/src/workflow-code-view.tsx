import type { WorkflowDefinition, WorkflowNode } from "@flowcordia/workflow";
import { CheckCircle2, CircleAlert, ExternalLink, FileCode2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useBuilderStateContext } from "@/app/builder/builder-hooks";
import { CodeEditor } from "@/app/builder/step-settings/code-settings/code-editor";

import { activepiecesFlowToFlowcordia } from "./flowcordia-activepieces-bridge";
import { parseWorkflowCode, serializeWorkflowCode } from "./workflow-code";
import "./workflow-code-view.css";

interface WorkflowCodeViewProps {
  onReplace(workflow: WorkflowDefinition): void;
  onOpenNode(nodeId: string): void;
}

function nodeLabel(node: WorkflowNode): string {
  return node.name?.trim() || node.id;
}

export function WorkflowCodeView({ onReplace, onOpenNode }: WorkflowCodeViewProps) {
  const [flow, flowVersion, readonly] = useBuilderStateContext((state) => [
    state.flow,
    state.flowVersion,
    state.readonly,
  ]);
  const initialDocument = useMemo(
    () => activepiecesFlowToFlowcordia({ ...flow, version: flowVersion }),
    // Code mode mounts from the latest canvas snapshot. Subsequent valid code
    // edits own this view until the user switches back to Canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [document, setDocument] = useState(initialDocument);
  const [sourceCode, setSourceCode] = useState({
    packageJson: "{}",
    code: serializeWorkflowCode(initialDocument),
  });
  const [issues, setIssues] = useState<string[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState(
    initialDocument.nodes.find((node) => node.kind !== "output")?.id ??
      initialDocument.nodes[0]?.id ??
      ""
  );
  const selectedNode = document.nodes.find((node) => node.id === selectedNodeId);

  const update = (nextSource: typeof sourceCode) => {
    setSourceCode(nextSource);
    if (readonly) return;

    const parsed = parseWorkflowCode(nextSource.code);
    if (!parsed.success) {
      setIssues(parsed.issues);
      return;
    }

    try {
      onReplace(parsed.workflow);
      setDocument(parsed.workflow);
      setIssues([]);
      if (!parsed.workflow.nodes.some((node) => node.id === selectedNodeId)) {
        setSelectedNodeId(
          parsed.workflow.nodes.find((node) => node.kind !== "output")?.id ??
            parsed.workflow.nodes[0]?.id ??
            ""
        );
      }
    } catch (error) {
      setIssues([
        error instanceof Error
          ? error.message
          : "The edited workflow cannot be represented by the visual builder.",
      ]);
    }
  };

  return (
    <div className="flowcordia-workflow-code-layout" data-testid="flowcordia-workflow-code-view">
      <textarea
        data-testid="flowcordia-workflow-code-source"
        hidden
        readOnly
        tabIndex={-1}
        value={sourceCode.code}
      />
      <main className="flowcordia-workflow-code-main">
        <div className="flowcordia-workflow-code-titlebar">
          <div>
            <span>Whole workflow</span>
            <strong>flowcordia.workflow.ts</strong>
          </div>
          <div
            className={
              issues.length === 0
                ? "flowcordia-workflow-code-state valid"
                : "flowcordia-workflow-code-state invalid"
            }
          >
            {issues.length === 0 ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
            {issues.length === 0 ? "Canvas synchronized" : "Last valid canvas preserved"}
          </div>
        </div>
        {issues.length > 0 && (
          <div className="flowcordia-workflow-code-errors" role="alert">
            <strong>Code needs attention</strong>
            <ul>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flowcordia-workflow-code-editor">
          <CodeEditor
            sourceCode={sourceCode}
            onChange={update}
            readonly={readonly}
            minHeight="calc(100vh - 170px)"
          />
        </div>
      </main>

      <aside className="flowcordia-workflow-code-sidebar">
        <div className="flowcordia-workflow-code-sidebar-heading">
          <span>Node view</span>
          <strong>{document.nodes.length} nodes</strong>
        </div>
        <div className="flowcordia-workflow-code-node-list">
          {document.nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className={node.id === selectedNodeId ? "selected" : undefined}
              onClick={() => setSelectedNodeId(node.id)}
            >
              <FileCode2 size={14} />
              <span>
                <strong>{nodeLabel(node)}</strong>
                <small>{node.operation}</small>
              </span>
            </button>
          ))}
        </div>
        {selectedNode && (
          <div className="flowcordia-workflow-code-node-detail">
            <span>{selectedNode.kind}</span>
            <strong>{nodeLabel(selectedNode)}</strong>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{selectedNode.id}</dd>
              </div>
              <div>
                <dt>Operation</dt>
                <dd>{selectedNode.operation}</dd>
              </div>
            </dl>
            <button
              type="button"
              disabled={selectedNode.kind === "output"}
              onClick={() => onOpenNode(selectedNode.id)}
            >
              <ExternalLink size={14} />
              Open node settings
            </button>
            {selectedNode.kind === "output" && (
              <p>Output nodes are edited directly in whole-workflow code.</p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
