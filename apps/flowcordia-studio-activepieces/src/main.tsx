import "@/polyfills";
import "@/i18n";
import "@/styles.css";
import "@xyflow/react/dist/style.css";
import React from "react";
import * as ReactDOM from "react-dom/client";
import { FlowcordiaActivepiecesStudioHost } from "./studio-host";

const root = document.getElementById("root");
if (!root) throw new Error("Flowcordia Studio root element is missing.");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <FlowcordiaActivepiecesStudioHost />
  </React.StrictMode>
);
