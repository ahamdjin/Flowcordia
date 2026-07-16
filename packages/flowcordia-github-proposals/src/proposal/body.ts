import type { WorkflowDefinition } from "@flowcordia/workflow";

import type { GitHubProposalIdentity } from "../types.js";

const WHITESPACE_PATTERN = /\s+/g;

function singleLine(value: string, fallback: string): string {
  const sanitized = Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f ? " " : character;
    })
    .join("")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
  return sanitized || fallback;
}

function markdownLine(value: string, fallback: string): string {
  return singleLine(value, fallback).replaceAll("<!--", "&lt;!--").replaceAll("-->", "--&gt;");
}

export function buildProposalTitle(workflow: WorkflowDefinition): string {
  const name = singleLine(workflow.name, workflow.id);
  const prefix = "Flowcordia: ";
  return `${prefix}${name.slice(0, 120 - prefix.length)}`;
}

export function buildProposalMarker(identity: GitHubProposalIdentity): string {
  return `<!-- flowcordia-proposal:v1 proposal=${identity.proposalId} workflow=${identity.workflowId} base=${identity.baseCommitSha} -->`;
}

export function buildProposalBody(
  identity: GitHubProposalIdentity,
  workflow: WorkflowDefinition
): string {
  const description = workflow.description
    ? markdownLine(workflow.description, "No description supplied.")
    : "No description supplied.";

  return [
    "## Flowcordia workflow proposal",
    "",
    `**Workflow:** \`${workflow.id}\``,
    `**Base commit:** \`${identity.baseCommitSha}\``,
    "",
    description,
    "",
    "### Reviewed artifacts",
    "",
    `- Visual workflow: \`.flowcordia/workflows/${workflow.id}.json\``,
    `- Generated Trigger.dev task: \`trigger/flowcordia/${workflow.id}.ts\``,
    "",
    "This pull request is managed by Flowcordia. Reviews and required checks must apply to the current head commit before promotion.",
    "",
    buildProposalMarker(identity),
  ].join("\n");
}

export function bodyHasProposalMarker(
  body: string | null,
  identity: GitHubProposalIdentity
): boolean {
  if (typeof body !== "string") return false;
  const marker = buildProposalMarker(identity);
  const lines = body.trimEnd().split("\n");
  return lines.at(-1) === marker && body.split(marker).length === 2;
}
