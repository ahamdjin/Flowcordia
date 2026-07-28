import fs from "node:fs";

const canvasPath =
  "apps/webapp/app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx";
let source = fs.readFileSync(canvasPath, "utf8");

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

const keyHandlerMarker = `  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {`;
const doubleClickHandler = `  const handleCanvasDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {\n    if (!(event.target instanceof Element) || !event.target.classList.contains("react-flow__pane")) {\n      return;\n    }\n    const instance = instanceRef.current;\n    if (!instance) return;\n    const clientPoint = { x: event.clientX, y: event.clientY };\n    openQuickCreate(\n      { context: "standalone", position: instance.screenToFlowPosition(clientPoint) },\n      clientPoint\n    );\n  };\n\n`;
if (!source.includes(keyHandlerMarker)) throw new Error("Missing canvas key handler marker.");
source = source.replace(keyHandlerMarker, doubleClickHandler + keyHandlerMarker);

const wrapperMarker = `      onKeyDownCapture={handleKeyDown}\n`;
const wrapperReplacement = `      onDoubleClick={handleCanvasDoubleClick}\n      onKeyDownCapture={handleKeyDown}\n`;
if (!source.includes(wrapperMarker)) throw new Error("Missing canvas wrapper event marker.");
source = source.replace(wrapperMarker, wrapperReplacement);

const paneHandler = `        onPaneDoubleClick={(event) => {\n          const instance = instanceRef.current;\n          if (!instance) return;\n          const clientPoint = { x: event.clientX, y: event.clientY };\n          openQuickCreate(\n            { context: "standalone", position: instance.screenToFlowPosition(clientPoint) },\n            clientPoint\n          );\n        }}\n`;
if (!source.includes(paneHandler)) throw new Error("Missing unsupported pane double-click block.");
source = source.replace(paneHandler, "");

const zoomMarker = `        zoomOnPinch\n        zoomOnScroll\n`;
const zoomReplacement = `        zoomOnPinch\n        zoomOnScroll\n        zoomOnDoubleClick={false}\n`;
if (!source.includes(zoomMarker)) throw new Error("Missing canvas zoom marker.");
source = source.replace(zoomMarker, zoomReplacement);

fs.writeFileSync(canvasPath, source);

const navigationPath = "apps/webapp/test/flowcordia/workflowStudioCanvasNavigation.test.ts";
let navigation = fs.readFileSync(navigationPath, "utf8");
const assertionMarker = `    expect(source).toContain("onPaneDoubleClick");`;
const assertionReplacement = `    expect(source).toContain("onDoubleClick={handleCanvasDoubleClick}");\n    expect(source).toContain("zoomOnDoubleClick={false}");`;
if (!navigation.includes(assertionMarker)) {
  throw new Error("Missing pane double-click contract assertion.");
}
navigation = navigation.replace(assertionMarker, assertionReplacement);
fs.writeFileSync(navigationPath, navigation);
