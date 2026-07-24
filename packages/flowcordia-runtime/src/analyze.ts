import {
  findInlineSecretPath,
  parseFlowcordiaHttpConfiguration,
  parseFlowcordiaMappingConfiguration,
  parseFlowcordiaSubflowConfiguration,
  validateWorkflow,
  type JsonObject,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
import cronParser from "cron-parser";
import type { FlowcordiaCompileIssue } from "./types.js";

const SUPPORTED_OPERATIONS = new Set([
  "trigger.manual",
  "trigger.api",
  "trigger.schedule",
  "trigger.webhook",
  "action.http",
  "data.map",
  "subflow.invoke",
  "control.condition",
  "control.wait",
  "code.task",
  "output.return",
]);

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function configurationIssue(
  workflow: WorkflowDefinition,
  nodeId: string
): FlowcordiaCompileIssue | undefined {
  const node = workflow.nodes.find((candidate) => candidate.id === nodeId)!;
  const config = node.configuration;
  switch (node.operation) {
    case "trigger.schedule":
      if (
        typeof config.cron !== "string" ||
        config.cron.trim().length === 0 ||
        config.cron.length > 256 ||
        typeof config.timezone !== "string" ||
        config.timezone.trim().length === 0 ||
        config.timezone.length > 128
      ) {
        return {
          code: "invalid_configuration",
          nodeId,
          message: "Schedule triggers require a bounded cron expression and timezone.",
        };
      }
      try {
        if (config.cron.trim().split(/\s+/).length > 5) throw new Error();
        if (!isIanaTimezone(config.timezone.trim())) throw new Error();
        cronParser.parseExpression(config.cron.trim(), { tz: config.timezone.trim() });
      } catch {
        return {
          code: "invalid_configuration",
          nodeId,
          message: "Schedule triggers require a valid cron expression and IANA timezone.",
        };
      }
      break;
    case "trigger.webhook":
      if (
        typeof config.method !== "string" ||
        !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(config.method.toUpperCase()) ||
        typeof config.path !== "string" ||
        !config.path.startsWith("/")
      ) {
        return {
          code: "invalid_configuration",
          nodeId,
          message: "Webhook triggers require a supported method and an absolute route path.",
        };
      }
      break;
    case "action.http":
      const httpConfiguration = parseFlowcordiaHttpConfiguration(config);
      if (!httpConfiguration.success) {
        return {
          code: "invalid_configuration",
          nodeId,
          message: httpConfiguration.issues[0]?.message ?? "HTTP node configuration is invalid.",
        };
      }
      break;
    case "data.map": {
      const mappingConfiguration = parseFlowcordiaMappingConfiguration(config);
      if (!mappingConfiguration.success) {
        return {
          code: "invalid_configuration",
          nodeId,
          message:
            mappingConfiguration.issues[0]?.message ?? "Data mapping configuration is invalid.",
        };
      }
      break;
    }
    case "subflow.invoke": {
      const subflowConfiguration = parseFlowcordiaSubflowConfiguration(config);
      if (!subflowConfiguration.success) {
        return {
          code: "invalid_configuration",
          nodeId,
          message: subflowConfiguration.issues[0]?.message ?? "Subflow configuration is invalid.",
        };
      }
      if (subflowConfiguration.configuration.workflowId === workflow.id) {
        return {
          code: "invalid_configuration",
          nodeId,
          message: "A workflow cannot invoke itself as a subflow.",
        };
      }
      if (!node.inputSchema || !node.outputSchema) {
        return {
          code: "invalid_configuration",
          nodeId,
          message: "Subflow nodes require input and output schemas.",
        };
      }
      break;
    }
    case "control.wait":
      if (
        typeof config.durationSeconds !== "number" ||
        !Number.isFinite(config.durationSeconds) ||
        config.durationSeconds < 0
      ) {
        return {
          code: "invalid_configuration",
          nodeId,
          message: "Wait nodes require a non-negative durationSeconds value.",
        };
      }
      break;
    case "control.condition":
      if (
        typeof config.path !== "string" ||
        !["equals", "not_equals", "exists"].includes(String(config.operator))
      ) {
        return {
          code: "invalid_configuration",
          nodeId,
          message: "Condition nodes require a path and a supported structured operator.",
        };
      }
      break;
    case "code.task":
      if (!node.codeReference) {
        return {
          code: "missing_code_reference",
          nodeId,
          message: "Code nodes must reference a reviewed repository export.",
        };
      }
      break;
  }
  return isObject(config)
    ? undefined
    : { code: "invalid_configuration", nodeId, message: "Node configuration must be JSON." };
}

export function analyzeWorkflow(workflow: WorkflowDefinition): {
  issues: FlowcordiaCompileIssue[];
  orderedNodeIds: string[];
} {
  const validated = validateWorkflow(workflow);
  if (!validated.success) {
    return {
      orderedNodeIds: [],
      issues: validated.issues.map((issue) => ({
        code: "invalid_workflow",
        message: issue.message,
        ...(issue.entity.id ? { nodeId: issue.entity.id } : {}),
      })),
    };
  }

  const issues: FlowcordiaCompileIssue[] = [];
  const triggers = workflow.nodes.filter((node) => node.kind === "trigger");
  if (triggers.length === 0) {
    issues.push({ code: "missing_trigger", message: "A workflow requires one trigger." });
  } else if (triggers.length > 1) {
    issues.push({
      code: "multiple_triggers",
      message: "The first compiler slice supports exactly one trigger per workflow.",
    });
  }

  for (const node of workflow.nodes) {
    if (!SUPPORTED_OPERATIONS.has(node.operation)) {
      issues.push({
        code: "unsupported_operation",
        nodeId: node.id,
        message: `Operation "${node.operation}" is not supported by the first Flowcordia runtime.`,
      });
      continue;
    }
    const secretPath = findInlineSecretPath(node.configuration);
    if (secretPath) {
      issues.push({
        code: "invalid_configuration",
        nodeId: node.id,
        message: `Configuration field "${secretPath.join(".")}" looks like an inline secret. Use a credential reference instead.`,
      });
    } else {
      const issue = configurationIssue(workflow, node.id);
      if (issue) issues.push(issue);
    }
  }

  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const branchConditions = new Map<string, Set<string>>();
  for (const edge of workflow.edges) {
    const source = nodesById.get(edge.source);
    if (source?.operation === "control.condition") {
      if (edge.condition !== "true" && edge.condition !== "false") {
        issues.push({
          code: "invalid_configuration",
          nodeId: source.id,
          message: "Condition branches must be labelled true or false.",
        });
        continue;
      }
      const used = branchConditions.get(source.id) ?? new Set<string>();
      if (used.has(edge.condition)) {
        issues.push({
          code: "invalid_configuration",
          nodeId: source.id,
          message: `Condition node has more than one ${edge.condition} branch.`,
        });
      }
      used.add(edge.condition);
      branchConditions.set(source.id, used);
    } else if (edge.condition !== undefined) {
      issues.push({
        code: "invalid_configuration",
        nodeId: source?.id,
        message: "Only condition nodes can own conditional branches in this runtime.",
      });
    }
  }

  const indegree = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(workflow.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of workflow.edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const queue = workflow.nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort();
  const orderedNodeIds: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    orderedNodeIds.push(current);
    for (const target of (outgoing.get(current) ?? []).sort()) {
      const next = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
        queue.sort();
      }
    }
  }
  if (orderedNodeIds.length !== workflow.nodes.length) {
    issues.push({ code: "cycle_detected", message: "Workflow cycles are not supported yet." });
  }

  if (triggers.length === 1) {
    const reached = new Set<string>();
    const pending = [triggers[0]!.id];
    while (pending.length > 0) {
      const current = pending.shift()!;
      if (reached.has(current)) continue;
      reached.add(current);
      pending.push(...(outgoing.get(current) ?? []));
    }
    for (const node of workflow.nodes) {
      if (!reached.has(node.id)) {
        issues.push({
          code: "unreachable_node",
          nodeId: node.id,
          message: `Node "${node.id}" is not reachable from the workflow trigger.`,
        });
      }
    }
  }

  return { issues, orderedNodeIds };
}
