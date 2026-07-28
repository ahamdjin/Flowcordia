import fs from "node:fs";

const path = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx";
let source = fs.readFileSync(path, "utf8");

const importMarker = `  type NodeProps,\n  type OnReconnect,\n  type ReactFlowInstance,`;
const importReplacement = `  type NodeProps,\n  type OnConnectEnd,\n  type OnReconnect,\n  type ReactFlowInstance,`;
if (!source.includes(importMarker)) throw new Error("Missing React Flow type import marker.");
source = source.replace(importMarker, importReplacement);

const handlerMarker = `  const handleConnectEnd = (\n    event: MouseEvent | TouchEvent,\n    state: { isValid: boolean; toNode: unknown }\n  ) => {`;
const handlerReplacement = `  const handleConnectEnd: OnConnectEnd = (event, state) => {`;
if (!source.includes(handlerMarker)) throw new Error("Missing connect-end handler marker.");
source = source.replace(handlerMarker, handlerReplacement);
source = source.replace(
  `    if (!source || state.isValid || state.toNode) return;`,
  `    if (!source || state.isValid === true || state.toNode) return;`
);

const paneMarker = `        onPaneDoubleClick={(event) => {`;
const paneReplacement = `        onPaneDoubleClick={(event: React.MouseEvent<Element, MouseEvent>) => {`;
if (!source.includes(paneMarker)) throw new Error("Missing pane double-click marker.");
source = source.replace(paneMarker, paneReplacement);

fs.writeFileSync(path, source);
