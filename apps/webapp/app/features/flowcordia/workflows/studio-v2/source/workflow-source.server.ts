import {
  formatWorkflowIssuePath,
  validateWorkflow,
  type JsonValue,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
import * as ts from "typescript";
import { STUDIO_V2_WORKFLOW_SOURCE_MODULE } from "./workflow-source";

const SOURCE_FILE = "workflow.ts";

export class StudioV2WorkflowSourceError extends Error {
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, location?: { line: number; column: number }) {
    super(message);
    this.name = "StudioV2WorkflowSourceError";
    this.line = location?.line;
    this.column = location?.column;
  }
}

function sourceError(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  message: string
): StudioV2WorkflowSourceError {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return new StudioV2WorkflowSourceError(message, {
    line: position.line + 1,
    column: position.character + 1,
  });
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(sourceFile: ts.SourceFile, name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  throw sourceError(sourceFile, name, "Workflow property names must be static.");
}

function jsonValueFromExpression(sourceFile: ts.SourceFile, expression: ts.Expression): JsonValue {
  const value = unwrapExpression(expression);

  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isNumericLiteral(value)) return Number(value.text);
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (value.kind === ts.SyntaxKind.NullKeyword) return null;
  if (
    ts.isPrefixUnaryExpression(value) &&
    value.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(value.operand)
  ) {
    return -Number(value.operand.text);
  }
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.map((element) => {
      if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) {
        throw sourceError(sourceFile, element, "Workflow arrays cannot contain spreads or holes.");
      }
      return jsonValueFromExpression(sourceFile, element);
    });
  }
  if (ts.isObjectLiteralExpression(value)) {
    const result: Record<string, JsonValue> = {};
    for (const property of value.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw sourceError(
          sourceFile,
          property,
          "Workflow objects support static property assignments only."
        );
      }
      const name = propertyName(sourceFile, property.name);
      if (Object.hasOwn(result, name)) {
        throw sourceError(
          sourceFile,
          property.name,
          `Workflow property ${JSON.stringify(name)} is duplicated.`
        );
      }
      result[name] = jsonValueFromExpression(sourceFile, property.initializer);
    }
    return result;
  }

  throw sourceError(
    sourceFile,
    value,
    "Workflow values must be static JSON. Put executable TypeScript inside a code node's configuration.source field."
  );
}

export function parseStudioV2WorkflowSource(source: string): WorkflowDefinition {
  const sourceFile = ts.createSourceFile(
    SOURCE_FILE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const diagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] }
  ).parseDiagnostics;
  const diagnostic = diagnostics?.[0];
  if (diagnostic) {
    const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
    throw new StudioV2WorkflowSourceError(
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      {
        line: position.line + 1,
        column: position.character + 1,
      }
    );
  }

  const unsupported = sourceFile.statements.find(
    (statement) => !ts.isImportDeclaration(statement) && !ts.isExportAssignment(statement)
  );
  if (unsupported) {
    throw sourceError(
      sourceFile,
      unsupported,
      "Source may contain imports and one default defineWorkflow export only."
    );
  }
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      (!ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== STUDIO_V2_WORKFLOW_SOURCE_MODULE)
    ) {
      throw sourceError(
        sourceFile,
        statement.moduleSpecifier,
        `Workflow source may import only from ${STUDIO_V2_WORKFLOW_SOURCE_MODULE}.`
      );
    }
  }

  const exports = sourceFile.statements.filter(ts.isExportAssignment);
  if (exports.length !== 1 || exports[0]?.isExportEquals) {
    throw new StudioV2WorkflowSourceError(
      "Source must contain exactly one export default defineWorkflow({...}) statement."
    );
  }

  const exported = unwrapExpression(exports[0].expression);
  if (
    !ts.isCallExpression(exported) ||
    !ts.isIdentifier(exported.expression) ||
    exported.expression.text !== "defineWorkflow" ||
    exported.arguments.length !== 1
  ) {
    throw sourceError(
      sourceFile,
      exported,
      "The default export must call defineWorkflow with one workflow object."
    );
  }

  const document = jsonValueFromExpression(sourceFile, exported.arguments[0]);
  const validation = validateWorkflow(document);
  if (!validation.success) {
    const issue = validation.issues[0];
    throw new StudioV2WorkflowSourceError(
      issue
        ? `${issue.message} (${formatWorkflowIssuePath(issue.path)})`
        : "The workflow definition is invalid."
    );
  }
  return validation.workflow;
}
