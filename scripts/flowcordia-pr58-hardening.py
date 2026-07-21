from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


replace_once(
    "apps/webapp/app/v3/objectStoreClient.server.ts",
    '''  private buildBucketUrl(): string {\n    const url = new URL(this.config.baseUrl);\n    if (this.config.bucket && (url.pathname === "" || url.pathname === "/")) {\n      url.pathname = normalizeObjectStoreLogicalKeyPathname(this.config.bucket);\n    }\n    return url.toString();\n  }\n''',
    '''  private buildBucketUrl(): string {\n    const url = new URL(this.config.baseUrl);\n    const bucketIsAlreadyInHost = this.config.bucket\n      ? url.hostname.toLowerCase().startsWith(`${this.config.bucket.toLowerCase()}.`)\n      : false;\n    if (\n      this.config.bucket &&\n      !bucketIsAlreadyInHost &&\n      (url.pathname === "" || url.pathname === "/")\n    ) {\n      url.pathname = normalizeObjectStoreLogicalKeyPathname(this.config.bucket);\n    }\n    return url.toString();\n  }\n''',
)

replace_once(
    "apps/webapp/app/v3/objectStore.server.ts",
    '''export function hasObjectStoreClient(): boolean {\n  const defaultConfig = getObjectStoreConfig();\n  const protocolConfig = env.OBJECT_STORE_DEFAULT_PROTOCOL\n    ? getObjectStoreConfig(env.OBJECT_STORE_DEFAULT_PROTOCOL)\n    : undefined;\n  return !!(defaultConfig || protocolConfig);\n}\n''',
    '''export function hasObjectStoreClient(): boolean {\n  const defaultConfig = getObjectStoreConfig();\n  const protocolConfig = env.OBJECT_STORE_DEFAULT_PROTOCOL\n    ? getObjectStoreConfig(env.OBJECT_STORE_DEFAULT_PROTOCOL)\n    : undefined;\n  return !!(defaultConfig || protocolConfig);\n}\n\nexport async function verifyObjectStoreConnection(storageProtocol?: string): Promise<void> {\n  const protocol = storageProtocol ?? env.OBJECT_STORE_DEFAULT_PROTOCOL;\n  const client = getObjectStoreClient(protocol);\n  if (!client) {\n    throw new Error("Object store is not configured");\n  }\n  await client.verify();\n}\n''',
)

replace_once(
    "apps/webapp/app/features/flowcordia/operations/provider-preflight.ts",
    '''  const email = emailConfiguration(input.environment);\n  const store = selectObjectStore(input.environment);\n  const hasStaticCredentials = Boolean(store.accessKeyId && store.secretAccessKey);\n''',
    '''  const email = emailConfiguration(input.environment);\n  const selectedProtocol = presentValue(input.environment.OBJECT_STORE_DEFAULT_PROTOCOL);\n  const protocolReady = !selectedProtocol || PROTOCOL.test(selectedProtocol);\n  const store = selectObjectStore(input.environment);\n  const hasStaticCredentials = Boolean(store.accessKeyId && store.secretAccessKey);\n''',
)

replace_once(
    "apps/webapp/app/features/flowcordia/operations/provider-preflight.ts",
    '''  const objectStoreReady =\n    validHttpUrl(store.baseUrl) &&\n    credentialsPaired &&\n    (hasStaticCredentials || Boolean(store.bucket));\n''',
    '''  const objectStoreReady =\n    protocolReady &&\n    validHttpUrl(store.baseUrl) &&\n    credentialsPaired &&\n    (hasStaticCredentials || Boolean(store.bucket));\n''',
)

replace_once(
    "apps/webapp/scripts/flowcordia-provider-preflight.ts",
    '''import { sendPlainTextEmail } from "../app/services/email.server";\nimport { verifyObjectStoreConnection } from "../app/v3/objectStore.server";\n''',
    '''''',
)
replace_once(
    "apps/webapp/scripts/flowcordia-provider-preflight.ts",
    '''  const providers = await runFlowcordiaProviderPreflight({\n    environment: process.env,\n''',
    '''  const [{ sendPlainTextEmail }, { verifyObjectStoreConnection }] = await Promise.all([\n    import("../app/services/email.server"),\n    import("../app/v3/objectStore.server"),\n  ]);\n\n  const providers = await runFlowcordiaProviderPreflight({\n    environment: process.env,\n''',
)

replace_once(
    "apps/webapp/test/objectStore.test.ts",
    '''  uploadPacketToObjectStore,\n} from "~/v3/objectStore.server";\n''',
    '''  uploadPacketToObjectStore,\n  verifyObjectStoreConnection,\n} from "~/v3/objectStore.server";\n''',
)
replace_once(
    "apps/webapp/test/objectStore.test.ts",
    '''  );\n\n  postgresAndMinioTest(\n    "should upload and download data with protocol prefix",\n''',
    '''  );\n\n  postgresAndMinioTest(\n    "should verify the configured bucket without writing an object",\n    async ({ minioConfig }) => {\n      env.OBJECT_STORE_BASE_URL = minioConfig.baseUrl;\n      env.OBJECT_STORE_BUCKET = "packets";\n      env.OBJECT_STORE_ACCESS_KEY_ID = minioConfig.accessKeyId;\n      env.OBJECT_STORE_SECRET_ACCESS_KEY = minioConfig.secretAccessKey;\n      env.OBJECT_STORE_REGION = minioConfig.region;\n      env.OBJECT_STORE_DEFAULT_PROTOCOL = undefined;\n\n      await expect(verifyObjectStoreConnection()).resolves.toBeUndefined();\n    }\n  );\n\n  postgresAndMinioTest(\n    "should upload and download data with protocol prefix",\n''',
)

replace_once(
    "apps/webapp/test/flowcordia/providerPreflight.test.ts",
    '''  it("fails static object-store verification without exposing provider response details", async () => {\n''',
    '''  it("does not append a path bucket when the bucket is already virtual-hosted", async () => {\n    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));\n    vi.stubGlobal("fetch", fetch);\n    const client = ObjectStoreClient.create({\n      baseUrl: "https://packets.objects.example.com",\n      bucket: "packets",\n      accessKeyId: "test-access",\n      secretAccessKey: "test-secret",\n    });\n    await client.verify();\n    const request = fetch.mock.calls[0]?.[0] as Request;\n    expect(new URL(request.url).pathname).toBe("/");\n  });\n\n  it("fails static object-store verification without exposing provider response details", async () => {\n''',
)
replace_once(
    "apps/webapp/test/flowcordia/providerPreflight.test.ts",
    '''    expect(\n      presentFlowcordiaProviderConfiguration({\n        environment: readyEnvironment(),\n        checkedAt,\n        emailRecipientProvided: false,\n        emailConfirmation: undefined,\n      }).state\n    ).toBe("BLOCKED");\n''',
    '''    expect(\n      presentFlowcordiaProviderConfiguration({\n        environment: readyEnvironment(),\n        checkedAt,\n        emailRecipientProvided: false,\n        emailConfirmation: undefined,\n      }).state\n    ).toBe("BLOCKED");\n    expect(\n      configuration(\n        readyEnvironment({\n          OBJECT_STORE_DEFAULT_PROTOCOL: "../../unsafe",\n        })\n      ).state\n    ).toBe("BLOCKED");\n''',
)
