import {
  formatWorkflowIssuePath,
  validateWorkflow,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
import ts from "typescript";

export type WorkflowCodeParseResult =
  | { success: true; workflow: WorkflowDefinition; issues: [] }
  | { success: false; issues: string[] };

class WorkflowCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowCodeError";
  }
}

function templateLiteral(value: string): string {
  return `\`${value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${")}\``;
}

export function serializeWorkflowCode(workflow: WorkflowDefinition): string {
  const document = JSON.parse(JSON.stringify(workflow)) as WorkflowDefinition;
  const sourceDocuments: Array<{ placeholder: string; source: string }> = [];

  for (const [index, node] of document.nodes.entries()) {
    if (node.operation !== "code.typescript" || typeof node.configuration.source !== "string") {
      continue;
    }
    const placeholder = `__FLOWCORDIA_TYPESCRIPT_SOURCE_${index}__`;
    sourceDocuments.push({ placeholder, source: node.configuration.source });
    node.configuration.source = placeholder;
  }

  let objectLiteral = JSON.stringify(document, null, 2);
  for (const sourceDocument of sourceDocuments) {
    objectLiteral = objectLiteral.replace(
      JSON.stringify(sourceDocument.placeholder),
      templateLiteral(sourceDocument.source)
    );
  }

  return `import { defineWorkflow } from "@flowcordia/workflow";\n\nexport default defineWorkflow(${objectLiteral});\n`;
}

function positionMessage(sourceFile: ts.SourceFile, node: ts.Node, message: string): string {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `Line ${position.line + 1}, column ${position.character + 1}: ${message}`;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(sourceFile: ts.SourceFile, name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  throw new WorkflowCodeError(
    positionMessage(sourceFile, name, "Computed workflow property names are not supported.")
  );
}

function literalValue(sourceFile: ts.SourceFile, input: ts.Expression): unknown {
  const expression = unwrapExpression(input);

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;

  if (ts.isPrefixUnaryExpression(expression)) {
    const operand = unwrapExpression(expression.operand);
    if (!ts.isNumericLiteral(operand)) {
      throw new WorkflowCodeError(
        positionMessage(sourceFile, expression, "Only numeric unary expressions are supported.")
      );
    }
    const value = Number(operand.text);
    if (expression.operator === ts.SyntaxKind.MinusToken) return -value;
    if (expression.operator === ts.SyntaxKind.PlusToken) return value;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((element) => {
      if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) {
        throw new WorkflowCodeError(
          positionMessage(sourceFile, element, "Workflow arrays cannot contain spreads or holes.")
        );
      }
      return literalValue(sourceFile, element);
    });
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const output = Object.create(null) as Record<string, unknown>;
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw new WorkflowCodeError(
          positionMessage(
            sourceFile,
            property,
            "Workflow objects accept property assignments only; spreads, methods and shorthand properties are disabled."
          )
        );
      }
      const key = propertyName(sourceFile, property.name);
      if (Object.hasOwn(output, key)) {
        throw new WorkflowCodeError(
          positionMessage(sourceFile, property.name, `Duplicate workflow property ${JSON.stringify(key)}.`)
        );
      }
      output[key] = literalValue(sourceFile, property.initializer);
    }
    return output;
  }

  if (ts.isTemplateExpression(expression)) {
    throw new WorkflowCodeError(
      positionMessage(
        sourceFile,
        expression,
        "Template substitutions are not executed in workflow code. Use a plain template string."
      )
    );
  }

  throw new WorkflowCodeError(
    positionMessage(
      sourceFile,
      expression,
      "Workflow code accepts JSON-compatible literals and plain Source template strings only."
    )
  );
}

function parseWorkflowExpression(sourceFile: ts.SourceFile): unknown {
  let exportExpression: ts.Expression | undefined;

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== "@flowcordia/workflow"
      ) {
        throw new WorkflowCodeError(
          positionMessage(
            sourceFile,
            statement,
            'Only the "@flowcordia/workflow" import is allowed in whole-workflow code.'
          )
        );
      }
      const namedBindings = statement.importClause?.namedBindings;
      if (
        !namedBindings ||
        !ts.isNamedImports(namedBindings) ||
        namedBindings.elements.some(
          (element) => (element.propertyName ?? element.name).text !== "defineWorkflow"
        )
      ) {
        throw new WorkflowCodeError(
          positionMessage(sourceFile, statement, "Import defineWorkflow as a named import only.")
        );
      }
      continue;
    }

    if (ts.isExportAssignment(statement) && !statement.isExportEquals && !exportExpression) {
      exportExpression = statement.expression;
      continue;
    }

    if (ts.isEmptyStatement(statement)) continue;
    throw new WorkflowCodeError(
      positionMessage(
        sourceFile,
        statement,
        "Whole-workflow code may contain only the defineWorkflow import and one default export."
      )
    );
  }

  if (!exportExpression) {
    throw new WorkflowCodeError("Export one workflow with `export default defineWorkflow({ ... })`.");
  }

  const expression = unwrapExpression(exportExpression);
  if (
    !ts.isCallExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    expression.expression.text !== "defineWorkflow" ||
    expression.arguments.length !== 1
  ) {
    throw new WorkflowCodeError("The default export must be `defineWorkflow({ ... })`.");
  }

  return literalValue(sourceFile, expression.arguments[0]);
}

export function parseWorkflowCode(code: string): WorkflowCodeParseResult {
  const sourceFile = ts.createSourceFile(
    "flowcordia.workflow.ts",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const diagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.DiagnosticWithLocation[] }
  ).parseDiagnostics;
  if (diagnostics.length > 0) {
    return {
      success: false,
      issues: diagnostics.slice(0, 5).map((diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
        if (diagnostic.start === undefined) return message;
        const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
        return `Line ${position.line + 1}, column ${position.character + 1}: ${message}`;
      }),
    };
  }

  try {
    const value = parseWorkflowExpression(sourceFile);
    const validation = validateWorkflow(value);
    if (!validation.success) {
      return {
        success: false,
        issues: validation.issues.slice(0, 8).map(
          (issue) => `${formatWorkflowIssuePath(issue.path)}: ${issue.message}`
        ),
      };
    }
    return { success: true, workflow: validation.workflow, issues: [] };
  } catch (error) {
    return {
      success: false,
      issues: [error instanceof Error ? error.message : "Workflow code is invalid."],
    };
  }
}
