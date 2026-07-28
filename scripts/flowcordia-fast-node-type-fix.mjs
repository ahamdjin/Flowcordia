import fs from "node:fs";

const path = "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx";
let source = fs.readFileSync(path, "utf8");

const flowTypeMarker = `  type NodeProps,\n  type OnReconnect,\n  type ReactFlowInstance,`;
const flowTypeReplacement = `  type NodeProps,\n  type OnConnectEnd,\n  type OnReconnect,\n  type ReactFlowInstance,`;
if (!source.includes(flowTypeMarker)) throw new Error("Missing React Flow type import marker.");
source = source.replace(flowTypeMarker, flowTypeReplacement);

const reactTypeMarker = `import type { KeyboardEvent as ReactKeyboardEvent } from "react";`;
const reactTypeReplacement = `import type {\n  KeyboardEvent as ReactKeyboardEvent,\n  MouseEvent as ReactMouseEvent,\n} from "react";`;
if (!source.includes(reactTypeMarker)) throw new Error("Missing React event type import marker.");
source = source.replace(reactTypeMarker, reactTypeReplacement);

const handlerMarker = `  const handleConnectEnd = (\n    event: MouseEvent | TouchEvent,\n    state: { isValid: boolean; toNode: unknown }\n  ) => {`;
const handlerReplacement = `  const handleConnectEnd: OnConnectEnd = (event, state) => {`;
if (!source.includes(handlerMarker)) throw new Error("Missing connect-end handler marker.");
source = source.replace(handlerMarker, handlerReplacement);
source = source.replace(
  `    if (!source || state.isValid || state.toNode) return;`,
  `    if (!source || state.isValid === true || state.toNode) return;`
);

const paneMarker = `        onPaneDoubleClick={(event) => {`;
const paneReplacement = `        onPaneDoubleClick={(event: ReactMouseEvent<Element>) => {`;
if (!source.includes(paneMarker)) throw new Error("Missing pane double-click marker.");
source = source.replace(paneMarker, paneReplacement);

fs.writeFileSync(path, source);
