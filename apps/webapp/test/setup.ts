// Load apps/webapp/.env into process.env so env.server's top-level
// EnvironmentSchema.parse(process.env) succeeds in vitest workers.
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env") });

const localTestDefaults = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/trigger_test",
  DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:5432/trigger_test",
  SESSION_SECRET: "local-test-session-secret",
  MAGIC_LINK_SECRET: "local-test-magic-link-secret",
  ENCRYPTION_KEY: "local-test-encryption-key-32byte",
  DEPLOY_REGISTRY_HOST: "127.0.0.1:5000",
  V4_DEPLOY_REGISTRY_HOST: "127.0.0.1:5000",
  CLICKHOUSE_URL: "http://127.0.0.1:8123",
} as const;

for (const [name, value] of Object.entries(localTestDefaults)) {
  process.env[name] ??= value;
}
