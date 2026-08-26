import { isAbsolute, normalize, relative, resolve } from "node:path";

export type StudioBuildMetadata = {
  artifactKey: string;
  buildId?: string;
  configFilePath?: string;
  isNativeBuild: true;
  skipPromotion?: boolean;
};

export function parseStudioBuildMetadata(value: unknown): StudioBuildMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;

  const candidate = value as Record<string, unknown>;
  if (candidate.isNativeBuild !== true) return;
  if (typeof candidate.artifactKey !== "string" || candidate.artifactKey.length === 0) return;
  if (candidate.buildId !== undefined && typeof candidate.buildId !== "string") return;
  if (candidate.configFilePath !== undefined && typeof candidate.configFilePath !== "string") {
    return;
  }
  if (candidate.skipPromotion !== undefined && typeof candidate.skipPromotion !== "boolean") {
    return;
  }

  return {
    artifactKey: candidate.artifactKey,
    buildId: candidate.buildId,
    configFilePath: candidate.configFilePath,
    isNativeBuild: true,
    skipPromotion: candidate.skipPromotion,
  };
}

export function environmentSlug(type: string): "dev" | "staging" | "prod" | undefined {
  switch (type) {
    case "DEVELOPMENT":
      return "dev";
    case "STAGING":
      return "staging";
    case "PRODUCTION":
      return "prod";
    default:
      return;
  }
}

export function safeConfigPath(workspace: string, requested?: string): string {
  const configPath = normalize(requested || "trigger.config.ts");
  if (isAbsolute(configPath)) throw new Error("Studio build config path must be relative");

  const absolute = resolve(workspace, configPath);
  const workspaceRelative = relative(resolve(workspace), absolute);
  if (workspaceRelative.startsWith("..") || isAbsolute(workspaceRelative)) {
    throw new Error("Studio build config path escapes the extracted workspace");
  }

  return workspaceRelative.replaceAll("\\", "/");
}

export function dockerAuthConfig(registry: string, username: string, password: string) {
  return {
    auths: {
      [registry]: {
        auth: Buffer.from(`${username}:${password}`).toString("base64"),
      },
    },
  };
}
