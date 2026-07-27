import { createPrivateKey } from "node:crypto";
import { App } from "octokit";
import { z } from "zod";
import { env } from "~/env.server";
import { logger } from "~/services/logger.server";
import { getSecretStore, type SecretStore } from "~/services/secrets/secretStore.server";

const GITHUB_APP_CONFIGURATION_KEY = "flowcordia:platform:github-app";
const GITHUB_APP_CONFIGURATION_VERSION = "1" as const;

const GitHubAppSlugSchema = z
  .string()
  .trim()
  .min(1, "GitHub App slug is required.")
  .max(100, "GitHub App slug is too long.")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/,
    "GitHub App slug must use lowercase letters, numbers, and hyphens."
  );

const GitHubPrivateKeySchema = z
  .string()
  .transform((value) => value.replace(/\r\n/g, "\n").trim())
  .refine((value) => value.length >= 256 && value.length <= 64 * 1024, {
    message: "GitHub App private key has an invalid size.",
  })
  .refine(
    (value) =>
      (/^-----BEGIN (?:RSA )?PRIVATE KEY-----\n/.test(value) &&
        /\n-----END (?:RSA )?PRIVATE KEY-----$/.test(value)) ||
      (/^-----BEGIN EC PRIVATE KEY-----\n/.test(value) &&
        /\n-----END EC PRIVATE KEY-----$/.test(value)),
    { message: "GitHub App private key must be a complete PEM private key." }
  );

export const FlowcordiaGitHubAppConfigurationInputSchema = z
  .object({
    appId: z.coerce
      .number({ invalid_type_error: "GitHub App ID must be a number." })
      .int("GitHub App ID must be a whole number.")
      .positive("GitHub App ID must be positive.")
      .max(Number.MAX_SAFE_INTEGER, "GitHub App ID is outside the supported range."),
    slug: GitHubAppSlugSchema,
    privateKey: GitHubPrivateKeySchema,
    webhookSecret: z
      .string()
      .trim()
      .min(16, "Webhook secret must contain at least 16 characters.")
      .max(512, "Webhook secret is too long."),
  })
  .strict();

export type FlowcordiaGitHubAppConfigurationInput = z.infer<
  typeof FlowcordiaGitHubAppConfigurationInputSchema
>;

const StoredFlowcordiaGitHubAppConfigurationSchema =
  FlowcordiaGitHubAppConfigurationInputSchema.extend({
    version: z.literal(GITHUB_APP_CONFIGURATION_VERSION),
  });

type StoredFlowcordiaGitHubAppConfiguration = z.infer<
  typeof StoredFlowcordiaGitHubAppConfigurationSchema
>;

export type FlowcordiaGitHubAppConfiguration = FlowcordiaGitHubAppConfigurationInput & {
  source: "environment" | "encrypted_setup";
};

export type FlowcordiaGitHubAppConfigurationStatus = {
  configured: true;
  appId: number;
  slug: string;
  source: FlowcordiaGitHubAppConfiguration["source"];
};

export type FlowcordiaGitHubAppConfigurationResult =
  | {
      success: true;
      status: FlowcordiaGitHubAppConfigurationStatus;
    }
  | {
      success: false;
      message: string;
      fieldErrors?: Partial<Record<keyof FlowcordiaGitHubAppConfigurationInput, string[]>>;
    };

function environmentConfiguration(source: object = env): FlowcordiaGitHubAppConfiguration | null {
  if (Reflect.get(source, "GITHUB_APP_ENABLED") !== "1") return null;

  const appId = Number(Reflect.get(source, "GITHUB_APP_ID"));
  const slug = Reflect.get(source, "GITHUB_APP_SLUG");
  const rawPrivateKey = Reflect.get(source, "GITHUB_APP_PRIVATE_KEY");
  const webhookSecret = Reflect.get(source, "GITHUB_APP_WEBHOOK_SECRET");
  if (
    !Number.isSafeInteger(appId) ||
    appId <= 0 ||
    typeof slug !== "string" ||
    slug.length === 0 ||
    typeof rawPrivateKey !== "string" ||
    rawPrivateKey.length === 0 ||
    typeof webhookSecret !== "string" ||
    webhookSecret.length === 0
  ) {
    return null;
  }

  return {
    appId,
    slug,
    privateKey: rawPrivateKey.replace(/\\n/g, "\n"),
    webhookSecret,
    source: "environment",
  };
}

export function resolveFlowcordiaGitHubAppConfiguration(input: {
  environment?: object;
  stored?: StoredFlowcordiaGitHubAppConfiguration;
}): FlowcordiaGitHubAppConfiguration | null {
  const configuredFromEnvironment = environmentConfiguration(input.environment ?? {});
  if (configuredFromEnvironment) return configuredFromEnvironment;
  return input.stored ? { ...input.stored, source: "encrypted_setup" } : null;
}

function statusFor(
  configuration: FlowcordiaGitHubAppConfiguration
): FlowcordiaGitHubAppConfigurationStatus {
  return {
    configured: true,
    appId: configuration.appId,
    slug: configuration.slug,
    source: configuration.source,
  };
}

function store(): SecretStore {
  return getSecretStore("DATABASE");
}

export async function getFlowcordiaGitHubAppConfiguration(): Promise<FlowcordiaGitHubAppConfiguration | null> {
  const configuredFromEnvironment = environmentConfiguration();
  if (configuredFromEnvironment) return configuredFromEnvironment;

  const stored = await store().getSecret(
    StoredFlowcordiaGitHubAppConfigurationSchema,
    GITHUB_APP_CONFIGURATION_KEY
  );
  return stored ? { ...stored, source: "encrypted_setup" } : null;
}

export async function getFlowcordiaGitHubAppConfigurationStatus(): Promise<FlowcordiaGitHubAppConfigurationStatus | null> {
  const configuration = await getFlowcordiaGitHubAppConfiguration();
  return configuration ? statusFor(configuration) : null;
}

export async function isFlowcordiaGitHubAppConfigured(): Promise<boolean> {
  return (await getFlowcordiaGitHubAppConfiguration()) !== null;
}

export function createFlowcordiaGitHubApp(
  configuration: FlowcordiaGitHubAppConfigurationInput
): App {
  return new App({
    appId: configuration.appId,
    privateKey: configuration.privateKey,
    webhooks: { secret: configuration.webhookSecret },
  });
}

export async function getFlowcordiaGitHubApp(): Promise<App | null> {
  const configuration = await getFlowcordiaGitHubAppConfiguration();
  return configuration ? createFlowcordiaGitHubApp(configuration) : null;
}

export type FlowcordiaGitHubAppConfigurationDependencies = {
  environment?: object;
  verifyIdentity?: (
    configuration: FlowcordiaGitHubAppConfigurationInput
  ) => Promise<{ appId: number; slug: string }>;
  persist?: (configuration: StoredFlowcordiaGitHubAppConfiguration) => Promise<void>;
};

async function verifyGitHubAppIdentity(
  configuration: FlowcordiaGitHubAppConfigurationInput
): Promise<{ appId: number; slug: string }> {
  createPrivateKey(configuration.privateKey);
  const app = createFlowcordiaGitHubApp(configuration);
  const response = await app.octokit.rest.apps.getAuthenticated();
  return { appId: response.data.id, slug: response.data.slug };
}

function validationFieldErrors(
  error: z.ZodError<FlowcordiaGitHubAppConfigurationInput>
): Partial<Record<keyof FlowcordiaGitHubAppConfigurationInput, string[]>> {
  const flattened = error.flatten().fieldErrors;
  return {
    ...(flattened.appId ? { appId: flattened.appId } : {}),
    ...(flattened.slug ? { slug: flattened.slug } : {}),
    ...(flattened.privateKey ? { privateKey: flattened.privateKey } : {}),
    ...(flattened.webhookSecret ? { webhookSecret: flattened.webhookSecret } : {}),
  };
}

export async function configureFlowcordiaGitHubApp(
  input: unknown,
  dependencies: FlowcordiaGitHubAppConfigurationDependencies = {}
): Promise<FlowcordiaGitHubAppConfigurationResult> {
  if (environmentConfiguration(dependencies.environment ?? env)) {
    return {
      success: false,
      message: "GitHub App credentials are managed by server environment variables.",
    };
  }

  const parsed = FlowcordiaGitHubAppConfigurationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Check the GitHub App details and try again.",
      fieldErrors: validationFieldErrors(parsed.error),
    };
  }

  try {
    const verifyIdentity = dependencies.verifyIdentity ?? verifyGitHubAppIdentity;
    const identity = await verifyIdentity(parsed.data);
    if (identity.appId !== parsed.data.appId || identity.slug !== parsed.data.slug) {
      return {
        success: false,
        message: "GitHub authenticated a different App ID or slug.",
      };
    }

    const stored: StoredFlowcordiaGitHubAppConfiguration = {
      version: GITHUB_APP_CONFIGURATION_VERSION,
      ...parsed.data,
    };
    const persist =
      dependencies.persist ??
      ((configuration: StoredFlowcordiaGitHubAppConfiguration) =>
        store().setSecret(GITHUB_APP_CONFIGURATION_KEY, configuration));
    await persist(stored);

    return {
      success: true,
      status: statusFor({ ...parsed.data, source: "encrypted_setup" }),
    };
  } catch (error) {
    logger.error("Flowcordia GitHub App configuration verification failed", {
      error: error instanceof Error ? error.message : "Unknown GitHub App verification failure",
    });
    return {
      success: false,
      message:
        "Flowcordia could not authenticate this GitHub App. Check the App ID, slug, and private key.",
    };
  }
}
