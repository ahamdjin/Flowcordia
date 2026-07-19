import { createHash } from "node:crypto";
import { isValidReviewerId } from "./evaluate.js";
import type { GitHubProposalPolicy } from "./types.js";

export const FLOWCORDIA_PROPOSAL_GOVERNANCE_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_PROPOSAL_GOVERNANCE_MAX_ITEMS = 50;
export const FLOWCORDIA_PROPOSAL_GOVERNANCE_MAX_APPROVALS = 10;

const PROFILE_KEYS = new Set([
  "schemaVersion",
  "minimumApprovals",
  "requiredCheckNames",
  "requiredReviewerIds",
  "allowedReviewerIds",
]);

export interface FlowcordiaProposalGovernanceProfile {
  schemaVersion: typeof FLOWCORDIA_PROPOSAL_GOVERNANCE_SCHEMA_VERSION;
  minimumApprovals: number;
  requiredCheckNames: string[];
  requiredReviewerIds: string[];
  allowedReviewerIds: string[] | null;
}

export type FlowcordiaProposalGovernanceProfileResult =
  | { success: true; profile: FlowcordiaProposalGovernanceProfile; issues: [] }
  | { success: false; issues: string[] };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function compareCanonicalStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeList(
  value: unknown,
  label: string,
  validateItem: (item: string) => boolean
): { value: string[]; issues: string[] } {
  if (!Array.isArray(value)) {
    return { value: [], issues: [`${label} must be an array.`] };
  }
  if (value.length > FLOWCORDIA_PROPOSAL_GOVERNANCE_MAX_ITEMS) {
    return {
      value: [],
      issues: [
        `${label} cannot contain more than ${FLOWCORDIA_PROPOSAL_GOVERNANCE_MAX_ITEMS} items.`,
      ],
    };
  }

  const issues: string[] = [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") {
      issues.push(`${label} contains a non-string item.`);
      continue;
    }
    const item = raw.trim();
    if (
      item.length === 0 ||
      item.length > 160 ||
      hasControlCharacter(item) ||
      !validateItem(item)
    ) {
      issues.push(`${label} contains an invalid item.`);
      continue;
    }
    if (seen.has(item)) {
      issues.push(`${label} must not contain duplicates.`);
      continue;
    }
    seen.add(item);
    normalized.push(item);
  }
  normalized.sort(compareCanonicalStrings);
  return { value: normalized, issues };
}

export function parseFlowcordiaProposalGovernanceProfile(
  value: unknown
): FlowcordiaProposalGovernanceProfileResult {
  if (!isRecord(value)) {
    return { success: false, issues: ["Proposal governance profile must be an object."] };
  }

  const issues: string[] = [];
  for (const key of Object.keys(value)) {
    if (!PROFILE_KEYS.has(key)) issues.push(`Unknown proposal governance property "${key}".`);
  }
  if (value.schemaVersion !== FLOWCORDIA_PROPOSAL_GOVERNANCE_SCHEMA_VERSION) {
    issues.push(
      `Proposal governance schemaVersion must be "${FLOWCORDIA_PROPOSAL_GOVERNANCE_SCHEMA_VERSION}".`
    );
  }
  if (
    !Number.isSafeInteger(value.minimumApprovals) ||
    Number(value.minimumApprovals) < 1 ||
    Number(value.minimumApprovals) > FLOWCORDIA_PROPOSAL_GOVERNANCE_MAX_APPROVALS
  ) {
    issues.push(
      `Minimum approvals must be an integer between 1 and ${FLOWCORDIA_PROPOSAL_GOVERNANCE_MAX_APPROVALS}.`
    );
  }

  const checks = normalizeList(value.requiredCheckNames, "Required check names", () => true);
  const requiredReviewers = normalizeList(
    value.requiredReviewerIds,
    "Required reviewer IDs",
    isValidReviewerId
  );
  const allowedReviewers =
    value.allowedReviewerIds === null
      ? { value: null, issues: [] as string[] }
      : normalizeList(value.allowedReviewerIds, "Allowed reviewer IDs", isValidReviewerId);
  issues.push(...checks.issues, ...requiredReviewers.issues, ...allowedReviewers.issues);

  if (allowedReviewers.value !== null) {
    const allowed = new Set(allowedReviewers.value);
    if (requiredReviewers.value.some((reviewerId) => !allowed.has(reviewerId))) {
      issues.push("Every required reviewer must also be present in the allowed reviewer list.");
    }
    if (Number(value.minimumApprovals) > allowedReviewers.value.length) {
      issues.push("Minimum approvals cannot exceed the allowed reviewer count.");
    }
  }

  if (issues.length > 0) return { success: false, issues: [...new Set(issues)] };
  return {
    success: true,
    profile: {
      schemaVersion: FLOWCORDIA_PROPOSAL_GOVERNANCE_SCHEMA_VERSION,
      minimumApprovals: Number(value.minimumApprovals),
      requiredCheckNames: checks.value,
      requiredReviewerIds: requiredReviewers.value,
      allowedReviewerIds: allowedReviewers.value,
    },
    issues: [],
  };
}

export function defaultFlowcordiaProposalGovernanceProfile(): FlowcordiaProposalGovernanceProfile {
  return {
    schemaVersion: FLOWCORDIA_PROPOSAL_GOVERNANCE_SCHEMA_VERSION,
    minimumApprovals: 1,
    requiredCheckNames: [],
    requiredReviewerIds: [],
    allowedReviewerIds: null,
  };
}

export function flowcordiaProposalGovernanceProfileDigest(
  profile: FlowcordiaProposalGovernanceProfile
): string {
  return createHash("sha256").update(JSON.stringify(profile), "utf8").digest("hex");
}

export function effectiveFlowcordiaProposalPolicy(
  profile: FlowcordiaProposalGovernanceProfile
): GitHubProposalPolicy {
  return {
    minimumApprovals: profile.minimumApprovals,
    requiredCheckNames: profile.requiredCheckNames,
    requiredReviewerIds: profile.requiredReviewerIds,
    ...(profile.allowedReviewerIds === null
      ? {}
      : { allowedReviewerIds: profile.allowedReviewerIds }),
    requireCurrentHeadApprovals: true,
    allowSelfApproval: false,
    blockChangesRequested: true,
  };
}

/**
 * Repository writers may strengthen governance, but they cannot relax a rule
 * through the ordinary Studio write surface. The comparison is intentionally
 * component-wise and fail-closed: every proposal accepted by the proposed
 * profile must remain acceptable under the current profile.
 */
export function validateFlowcordiaProposalGovernanceStrengthening(
  current: FlowcordiaProposalGovernanceProfile,
  proposed: FlowcordiaProposalGovernanceProfile
): string[] {
  const issues: string[] = [];
  if (proposed.minimumApprovals < current.minimumApprovals) {
    issues.push("Minimum approvals cannot be reduced from the current repository policy.");
  }

  const proposedChecks = new Set(proposed.requiredCheckNames);
  if (current.requiredCheckNames.some((name) => !proposedChecks.has(name))) {
    issues.push("Required checks cannot be removed from the current repository policy.");
  }

  const proposedRequiredReviewers = new Set(proposed.requiredReviewerIds);
  if (
    current.requiredReviewerIds.some((reviewerId) => !proposedRequiredReviewers.has(reviewerId))
  ) {
    issues.push("Required reviewers cannot be removed from the current repository policy.");
  }

  if (current.allowedReviewerIds !== null) {
    if (proposed.allowedReviewerIds === null) {
      issues.push(
        "The allowed reviewer constraint cannot be removed from the current repository policy."
      );
    } else {
      const currentAllowedReviewers = new Set(current.allowedReviewerIds);
      if (
        proposed.allowedReviewerIds.some((reviewerId) => !currentAllowedReviewers.has(reviewerId))
      ) {
        issues.push(
          "Allowed reviewers cannot be expanded through the repository-writer policy surface."
        );
      }
    }
  }

  return issues;
}
