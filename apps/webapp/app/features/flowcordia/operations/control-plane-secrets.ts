export const FLOWCORDIA_CONTROL_PLANE_SECRET_KEYS = [
  "PROVIDER_SECRET",
  "COORDINATOR_SECRET",
  "MANAGED_WORKER_SECRET",
] as const;

export type FlowcordiaControlPlaneSecretKey =
  (typeof FLOWCORDIA_CONTROL_PLANE_SECRET_KEYS)[number];

export interface FlowcordiaControlPlaneSecretIssue {
  key: FlowcordiaControlPlaneSecretKey;
  code: "missing" | "weak" | "known_default" | "duplicate";
  message: string;
}

const KNOWN_INSECURE_VALUES = new Set([
  "provider-secret",
  "coordinator-secret",
  "managed-secret",
]);
const PLACEHOLDER =
  /change[-_ ]?me|replace[-_ ]?me|example[-_ ]?secret|test[-_ ]?secret|placeholder/i;

function value(
  environment: Record<string, string | undefined>,
  key: FlowcordiaControlPlaneSecretKey
): string {
  return environment[key]?.trim() ?? "";
}

export function flowcordiaControlPlaneSecretIssues(
  environment: Record<string, string | undefined>
): FlowcordiaControlPlaneSecretIssue[] {
  const issues: FlowcordiaControlPlaneSecretIssue[] = [];
  const seen = new Map<string, FlowcordiaControlPlaneSecretKey>();

  for (const key of FLOWCORDIA_CONTROL_PLANE_SECRET_KEYS) {
    const secret = value(environment, key);
    if (!secret) {
      issues.push({
        key,
        code: "missing",
        message: `${key} is required for production control-plane authentication.`,
      });
      continue;
    }
    if (KNOWN_INSECURE_VALUES.has(secret)) {
      issues.push({
        key,
        code: "known_default",
        message: `${key} still uses a public development default.`,
      });
      continue;
    }
    if (secret.length < 32 || secret.length > 4096 || PLACEHOLDER.test(secret)) {
      issues.push({
        key,
        code: "weak",
        message: `${key} must contain 32 to 4096 non-placeholder characters.`,
      });
      continue;
    }

    const duplicate = seen.get(secret);
    if (duplicate) {
      issues.push({
        key,
        code: "duplicate",
        message: `${key} must be independent from ${duplicate}.`,
      });
    } else {
      seen.set(secret, key);
    }
  }

  return issues;
}

export function flowcordiaControlPlaneSecretsReady(
  environment: Record<string, string | undefined>
): boolean {
  return flowcordiaControlPlaneSecretIssues(environment).length === 0;
}
