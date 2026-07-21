import {
  presentFlowcordiaProviderConfiguration,
  type FlowcordiaProviderCheck,
  type FlowcordiaProviderPreflightProjection,
} from "./provider-preflight";

export interface FlowcordiaProviderPreflightDependencies {
  verifyObjectStore(): Promise<void>;
  sendProviderReadinessEmail(): Promise<void>;
}

export interface FlowcordiaProviderPreflightInput {
  environment: NodeJS.ProcessEnv;
  checkedAt: Date;
  emailRecipientProvided: boolean;
  emailConfirmation?: string;
  dependencies: FlowcordiaProviderPreflightDependencies;
}

function check(
  key: "object_store_access" | "email_acceptance",
  state: "READY" | "BLOCKED" | "UNAVAILABLE",
  message: string
): FlowcordiaProviderCheck {
  return { key, state, message };
}

export async function runFlowcordiaProviderPreflight(
  input: FlowcordiaProviderPreflightInput
): Promise<FlowcordiaProviderPreflightProjection> {
  const configuration = presentFlowcordiaProviderConfiguration(input);
  if (configuration.state !== "READY") {
    return {
      schemaVersion: "0.1",
      state: "BLOCKED",
      phase: "configuration",
      checkedAt: configuration.checkedAt,
      applicationCommitSha: configuration.applicationCommitSha,
      emailTransport: configuration.emailTransport,
      objectStoreMode: configuration.objectStoreMode,
      checks: [
        ...configuration.checks,
        check(
          "object_store_access",
          "BLOCKED",
          "Object-store access was not attempted because provider configuration is blocked."
        ),
        check(
          "email_acceptance",
          "BLOCKED",
          "Email provider acceptance was not attempted because provider configuration is blocked."
        ),
      ],
      message: configuration.message,
    };
  }

  try {
    await input.dependencies.verifyObjectStore();
  } catch {
    return {
      schemaVersion: "0.1",
      state: "UNAVAILABLE",
      phase: "object_store",
      checkedAt: configuration.checkedAt,
      applicationCommitSha: configuration.applicationCommitSha,
      emailTransport: configuration.emailTransport,
      objectStoreMode: configuration.objectStoreMode,
      checks: [
        ...configuration.checks,
        check(
          "object_store_access",
          "UNAVAILABLE",
          "The configured object-store bucket could not be verified safely."
        ),
        check(
          "email_acceptance",
          "BLOCKED",
          "The email provider was not contacted because object-store verification did not pass."
        ),
      ],
      message: "Provider readiness is unavailable at the object-store verification phase.",
    };
  }

  try {
    await input.dependencies.sendProviderReadinessEmail();
  } catch {
    return {
      schemaVersion: "0.1",
      state: "UNAVAILABLE",
      phase: "email",
      checkedAt: configuration.checkedAt,
      applicationCommitSha: configuration.applicationCommitSha,
      emailTransport: configuration.emailTransport,
      objectStoreMode: configuration.objectStoreMode,
      checks: [
        ...configuration.checks,
        check(
          "object_store_access",
          "READY",
          "The existing object-store client verified access to its configured bucket."
        ),
        check(
          "email_acceptance",
          "UNAVAILABLE",
          "The configured email provider did not accept the fixed readiness message."
        ),
      ],
      message: "Provider readiness is unavailable at the email provider phase.",
    };
  }

  return {
    schemaVersion: "0.1",
    state: "READY",
    phase: "complete",
    checkedAt: configuration.checkedAt,
    applicationCommitSha: configuration.applicationCommitSha,
    emailTransport: configuration.emailTransport,
    objectStoreMode: configuration.objectStoreMode,
    checks: [
      ...configuration.checks,
      check(
        "object_store_access",
        "READY",
        "The existing object-store client verified access to its configured bucket."
      ),
      check(
        "email_acceptance",
        "READY",
        "The configured email provider accepted the fixed readiness message."
      ),
    ],
    message:
      "Core external providers accepted their bounded readiness probes. Inbox delivery and durable object writes remain separate evidence.",
  };
}
