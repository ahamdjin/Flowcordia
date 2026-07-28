import fs from "node:fs";

const path = "apps/webapp/app/features/flowcordia/workflows/drafts/commands.server.ts";
let source = fs.readFileSync(path, "utf8");

const importMarker = `} from "./command-contract";\n`;
const importReplacement = `} from "./command-contract";\nimport {\n  WorkflowAddConnectedNodeCommand,\n  WorkflowInsertNodeOnEdgeCommand,\n} from "./fast-create-command-contract";\n`;
if (!source.includes(importMarker)) throw new Error("Missing draft command-contract import marker.");
if (!source.includes("WorkflowAddConnectedNodeCommand")) {
  source = source.replace(importMarker, importReplacement);
}

const unionMarker = `    })\n    .strict(),\n  z\n    .object({\n      type: z.literal("add_function_node"),`;
const unionReplacement = `    })\n    .strict(),\n  WorkflowAddConnectedNodeCommand,\n  WorkflowInsertNodeOnEdgeCommand,\n  z\n    .object({\n      type: z.literal("add_function_node"),`;
if (!source.includes(unionMarker)) throw new Error("Missing draft edit union insertion marker.");
if (!source.includes("  WorkflowAddConnectedNodeCommand,\n  WorkflowInsertNodeOnEdgeCommand,\n  z")) {
  source = source.replace(unionMarker, unionReplacement);
}

fs.writeFileSync(path, source);
