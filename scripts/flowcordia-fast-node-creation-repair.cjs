const fs = require("node:fs");

const path = "scripts/flowcordia-fast-node-creation-build.mjs";
let source = fs.readFileSync(path, "utf8");
const fixes = [
  [
    'type CanvasEdge = Edge<CanvasEdgeData, "flowcordia">;\\n\\nfunction nodeTone(`,',
    'type CanvasEdge = Edge<CanvasEdgeData, "flowcordia">;\\n\\n`,'
  ],
  [
    '}\\n\\nconst nodeTypes =`,\n  "canvas edge creator"',
    '}\\n\\n`,\n  "canvas edge creator"',
  ],
];

for (const [before, after] of fixes) {
  if (!source.includes(before)) {
    throw new Error(`Missing transformation repair: ${before}`);
  }
  source = source.replace(before, after);
}

fs.writeFileSync(path, source);
