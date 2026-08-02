from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"missing patch anchor: {label}")
    return text.replace(old, new, 1)


runtime = Path("packages/flowcordia-runtime/src/runtime.ts")
text = runtime.read_text()
text = replace_once(
    text,
    'import {\n  applyFlowcordiaMapping,',
    'import {\n  FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION,\n  FLOWCORDIA_ACTIVEPIECES_TRIGGER_OPERATION,\n  applyFlowcordiaMapping,',
    "runtime imports",
)
text = replace_once(
    text,
    '  parseFlowcordiaApprovalConfiguration,\n',
    '  parseFlowcordiaActivepiecesPieceConfiguration,\n  parseFlowcordiaApprovalConfiguration,\n',
    "runtime parser import",
)
text = replace_once(
    text,
    'import { analyzeWorkflow } from "./analyze.js";\n',
    'import { analyzeWorkflow } from "./analyze.js";\nimport { executeFlowcordiaActivepiecesAction } from "./activepieces.js";\n',
    "runtime executor import",
)
text = replace_once(
    text,
    '  switch (node.operation) {\n    case "trigger.manual":\n',
    '''  switch (node.operation) {
    case FLOWCORDIA_ACTIVEPIECES_TRIGGER_OPERATION:
      return value;
    case FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION: {
      const parsed = parseFlowcordiaActivepiecesPieceConfiguration(node);
      if (!parsed.success) throw new Error(parsed.message);
      return adapters.activepieces({
        node,
        configuration: parsed.configuration,
        workflowInput,
        outputs: Object.fromEntries(outputs),
      });
    }
    case "trigger.manual":
''',
    "runtime operation switch",
)
text = replace_once(
    text,
    '  return {\n    mode: "preview",\n    async http({ configuration, value }) {\n',
    '''  return {
    mode: "preview",
    async activepieces({ node, configuration }) {
      const mocked = options.activepiecesMocks?.[node.id];
      if (mocked !== undefined) return jsonValue(mocked);
      return {
        simulated: true,
        pieceName: configuration.settings.pieceName,
        pieceVersion: configuration.settings.pieceVersion,
        actionName: configuration.settings.actionName ?? null,
        nodeId: node.id,
      };
    },
    async http({ configuration, value }) {
''',
    "preview adapter",
)
text = replace_once(
    text,
    '  return {\n    mode: "live",\n    async subflow({ workflowId, payloads }) {\n',
    '''  return {
    mode: "live",
    async activepieces({ node, configuration, workflowInput, outputs }) {
      if (!options.loadActivepiecesPiece) {
        throw new Error("Activepieces piece loading is unavailable in this runtime.");
      }
      if (!options.resolveActivepiecesConnection) {
        throw new Error("Activepieces connection resolution is unavailable in this runtime.");
      }
      return executeFlowcordiaActivepiecesAction({
        node,
        configuration,
        workflowInput,
        outputs,
        services: {
          loadPiece: options.loadActivepiecesPiece,
          resolveConnection: options.resolveActivepiecesConnection,
          formulaEvaluator: options.activepiecesFormulaEvaluator,
          projectId: options.activepiecesProjectId,
          projectExternalId: options.activepiecesProjectExternalId,
          runId: options.activepiecesRunId,
          serverApiUrl: options.activepiecesServerApiUrl,
          serverPublicUrl: options.activepiecesServerPublicUrl,
        },
      });
    },
    async subflow({ workflowId, payloads }) {
''',
    "live adapter",
)
runtime.write_text(text)

types = Path("packages/flowcordia-runtime/src/types.ts")
text = types.read_text()
if "activepiecesRunId?: string;" not in text:
    text = replace_once(
        text,
        "  activepiecesProjectExternalId?: string;\n",
        "  activepiecesProjectExternalId?: string;\n  activepiecesRunId?: string;\n",
        "activepieces run id type",
    )
types.write_text(text)

index = Path("packages/flowcordia-runtime/src/index.ts")
text = index.read_text()
if 'export * from "./activepieces.js";' not in text:
    text = 'export * from "./activepieces.js";\n' + text
index.write_text(text)

compiler = Path("packages/flowcordia-runtime/src/compiler.ts")
text = compiler.read_text()
if not text.startswith('import { createHash } from "node:crypto";'):
    text = 'import { createHash } from "node:crypto";\n' + text
if "  isFlowcordiaActivepiecesPieceNode," not in text:
    text = replace_once(
        text,
        "  flowcordiaCredentialEnvironmentName,\n",
        "  flowcordiaCredentialEnvironmentName,\n  isFlowcordiaActivepiecesPieceNode,\n",
        "compiler activepieces import",
    )
if "function activepiecesConnectionEnvironmentName" not in text:
    text = replace_once(
        text,
        "function safeIdentifier(value: string): string {\n",
        '''function activepiecesConnectionEnvironmentName(externalId: string): string {
  const digest = createHash("sha256").update(externalId).digest("hex").slice(0, 40).toUpperCase();
  return `FLOWCORDIA_AP_CONNECTION_${digest}`;
}

function safeIdentifier(value: string): string {
''',
        "compiler connection env helper",
    )
text = replace_once(
    text,
    '''    if (references.length === 0 || unsupportedCredentialNodes.has(node.id)) continue;
    if (node.operation !== "action.http") {
''',
    '''    if (references.length === 0 || unsupportedCredentialNodes.has(node.id)) continue;
    if (isFlowcordiaActivepiecesPieceNode(node)) continue;
    if (node.operation !== "action.http") {
''',
    "compiler credential skip",
)
binding_anchor = '''  const credentialBindings = Object.fromEntries(
    Array.from(credentialEnvironment, ([environmentName, reference]) => [
      reference,
      environmentName,
    ])
  );
'''
if "const activepiecesConnectionBindings" not in text:
    text = replace_once(
        text,
        binding_anchor,
        binding_anchor
        + '''  const activepiecesConnectionBindings = Object.fromEntries(
    Array.from(
      new Set(
        workflow.nodes
          .filter((node) => isFlowcordiaActivepiecesPieceNode(node))
          .flatMap((node) => node.credentialReferences ?? [])
      )
    ).map((externalId) => [externalId, activepiecesConnectionEnvironmentName(externalId)])
  );
  const hasActivepiecesNodes = workflow.nodes.some((node) => isFlowcordiaActivepiecesPieceNode(node));
''',
        "compiler AP bindings",
    )
source_import_anchor = '    `import { ${taskImports} } from "@trigger.dev/sdk";`,\n'
if "activepiecesFormulaEvaluator" not in text:
    text = replace_once(
        text,
        source_import_anchor,
        source_import_anchor
        + '''    ...(hasActivepiecesNodes
      ? [`import { formulaEvaluator as activepiecesFormulaEvaluator } from "@activepieces/core-formula";`]
      : []),
''',
        "generated AP formula import",
    )
adapters_anchor = '    `const createAdapters = (flowcordiaRunId: string) => createTriggerRuntimeAdapters({`,\n    `  codeHandlers: { ${handlers.join(", ")} },`,\n'
if "resolveActivepiecesConnection" not in text:
    text = replace_once(
        text,
        adapters_anchor,
        adapters_anchor
        + '''    ...(hasActivepiecesNodes
      ? [
          `  loadActivepiecesPiece: async (packageName) => import(packageName) as Promise<Record<string, unknown>>,`,
          `  activepiecesFormulaEvaluator,`,
          `  activepiecesRunId: flowcordiaRunId,`,
          `  resolveActivepiecesConnection: async (externalId) => {`,
          `    const bindings: Record<string, string> = ${JSON.stringify(activepiecesConnectionBindings)};`,
          `    const environmentName = bindings[externalId];`,
          `    if (!environmentName) throw new Error(\\`Activepieces connection "\\${externalId}" is not bound.\\`);`,
          `    const raw = process.env[environmentName];`,
          `    if (!raw) throw new Error(\\`Activepieces connection environment "\\${environmentName}" is unavailable.\\`);`,
          `    return JSON.parse(raw) as unknown;`,
          `  },`,
        ]
      : []),
''',
        "generated AP adapters",
    )
compiler.write_text(text)

deployment = Path("apps/webapp/app/features/flowcordia/workflows/studio-v2/deployment-context.server.ts")
text = deployment.read_text()
if "ACTIVEPIECES_FORMULA_VERSION" not in text:
    text = replace_once(
        text,
        'const TRIGGER_SDK_VERSION = "4.5.0-rc.7";\n',
        'const TRIGGER_SDK_VERSION = "4.5.0-rc.7";\nconst ACTIVEPIECES_FORMULA_VERSION = "0.2.0";\n',
        "formula version",
    )
if '"@activepieces/core-formula": ACTIVEPIECES_FORMULA_VERSION' not in text:
    text = replace_once(
        text,
        '''      dependencies: {
        "@flowcordia/runtime": "workspace:*",
        "@trigger.dev/sdk": TRIGGER_SDK_VERSION,
        ...pieceDependencies,
      },
''',
        '''      dependencies: {
        "@flowcordia/runtime": "workspace:*",
        "@trigger.dev/sdk": TRIGGER_SDK_VERSION,
        ...(Object.keys(pieceDependencies).length > 0
          ? { "@activepieces/core-formula": ACTIVEPIECES_FORMULA_VERSION }
          : {}),
        ...pieceDependencies,
      },
''',
        "formula dependency",
    )
text = replace_once(
    text,
    '''  const externalPackages = [
    "secure-exec",
    "@secure-exec/typescript",
    ...activepiecesPieceDependencies(release).map(({ packageName }) => packageName),
  ];
''',
    '''  const piecePackages = activepiecesPieceDependencies(release).map(({ packageName }) => packageName);
  const externalPackages = [
    "secure-exec",
    "@secure-exec/typescript",
    ...(piecePackages.length > 0 ? ["@activepieces/core-formula"] : []),
    ...piecePackages,
  ];
''',
    "formula external dependency",
)
deployment.write_text(text)
