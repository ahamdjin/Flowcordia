export const OBJECT_STORE_PROTOCOL = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export interface ResolvedObjectStoreConfiguration {
  protocol?: string;
  source: "default" | "named" | "default_protocol_fallback";
  baseUrl: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  service?: string;
}

function present(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

type ObjectStoreConfigurationCandidate = Omit<ResolvedObjectStoreConfiguration, "baseUrl"> & {
  baseUrl?: string;
};

function provider(
  environment: Record<string, string | undefined>,
  prefix: string,
  protocol: string | undefined,
  source: ResolvedObjectStoreConfiguration["source"]
): ObjectStoreConfigurationCandidate {
  return {
    protocol,
    source,
    baseUrl: present(environment[`${prefix}BASE_URL`]),
    bucket: present(environment[`${prefix}BUCKET`]),
    accessKeyId: present(environment[`${prefix}ACCESS_KEY_ID`]),
    secretAccessKey: present(environment[`${prefix}SECRET_ACCESS_KEY`]),
    region: present(environment[`${prefix}REGION`]),
    service: present(environment[`${prefix}SERVICE`]),
  };
}

/**
 * Resolve exactly the provider the runtime will use.
 *
 * A named provider wins when it has its own base URL. Callers explicitly pass
 * the selected protocol for new/protocol-prefixed objects. An omitted protocol
 * always resolves the legacy generic provider so existing unprefixed objects do
 * not silently move when OBJECT_STORE_DEFAULT_PROTOCOL changes. For backwards-
 * compatible installations that selected `s3` before OBJECT_STORE_S3_* existed,
 * the generic OBJECT_STORE_* provider remains valid when its service matches the
 * selected protocol.
 */
export function resolveObjectStoreConfiguration(
  environment: Record<string, string | undefined>,
  requestedProtocol?: string
): ResolvedObjectStoreConfiguration | undefined {
  const selected = present(requestedProtocol);
  if (selected) {
    if (!OBJECT_STORE_PROTOCOL.test(selected)) return undefined;
    const named = provider(environment, `OBJECT_STORE_${selected.toUpperCase()}_`, selected, "named");
    if (named.baseUrl) return { ...named, baseUrl: named.baseUrl };

    const genericService = present(environment.OBJECT_STORE_SERVICE) ?? "s3";
    if (selected !== genericService) return undefined;
    const fallback = provider(environment, "OBJECT_STORE_", selected, "default_protocol_fallback");
    return fallback.baseUrl ? { ...fallback, baseUrl: fallback.baseUrl } : undefined;
  }

  const configuration = provider(environment, "OBJECT_STORE_", undefined, "default");
  return configuration.baseUrl
    ? { ...configuration, baseUrl: configuration.baseUrl }
    : undefined;
}
