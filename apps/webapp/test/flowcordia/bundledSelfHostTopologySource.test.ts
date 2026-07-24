import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveFlowcordiaDoctorObjectStoreEndpoint } from "../../../../docker/scripts/flowcordia-doctor.mjs";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

describe("Flowcordia bundled self-host source boundaries", () => {
  it("adds the complete bundle without changing the external application-plane contract", () => {
    const external = source("docker/flowcordia-self-host.yml");
    const bundled = source("docker/flowcordia-bundled.yml");

    for (const service of [
      "postgres",
      "redis",
      "electric",
      "clickhouse",
      "minio",
      "registry",
      "s2-init",
      "s2",
      "shared-init",
      "docker-proxy",
      "supervisor",
    ]) {
      expect(bundled).toContain(`  ${service}:`);
    }
    expect(external).not.toMatch(
      /\n  (postgres|redis|clickhouse|electric|minio|registry|s2|supervisor):\n/
    );
    expect(external).not.toContain("docker.sock");
  });

  it("binds S2, registry, bootstrap, and supervisor through explicit private identities", () => {
    const bundled = source("docker/flowcordia-bundled.yml");

    expect(bundled).toContain("REALTIME_STREAMS_DEFAULT_VERSION: v2");
    expect(bundled).toContain("REALTIME_STREAMS_S2_ENDPOINT: http://s2/v1");
    expect(bundled).toContain('REALTIME_STREAMS_S2_SKIP_ACCESS_TOKENS: "true"');
    expect(bundled).toContain(
      "TRIGGER_BOOTSTRAP_WORKER_TOKEN_PATH: /home/node/shared/worker_token"
    );
    expect(bundled).toContain("TRIGGER_WORKER_TOKEN: file:///home/node/shared/worker_token");
    expect(bundled).toContain("TRIGGER_API_URL: http://web:3000");
    expect(bundled).toContain("DOCKER_HOST: tcp://docker-proxy:2375");
    expect(bundled).toContain(
      "DEPLOY_REGISTRY_HOST: ${FLOWCORDIA_DEPLOY_REGISTRY_HOST:-localhost:5000}"
    );
  });

  it("keeps dependency ports private and gives Docker access only to the proxy", () => {
    const bundled = source("docker/flowcordia-bundled.yml");

    expect(bundled).not.toMatch(/published: "?5432"?/);
    expect(bundled).not.toMatch(/published: "?6379"?/);
    expect(bundled).not.toMatch(/published: "?8123"?/);
    expect(bundled).not.toMatch(/published: "?3000"?/);
    expect(bundled).toContain("host_ip: 127.0.0.1");
    expect(bundled).toContain("internal: true");
    expect(bundled.match(/docker\.sock/g)).toHaveLength(2);
    expect(bundled).toContain("/var/run/docker.sock:/var/run/docker.sock:ro");
    expect(bundled).not.toContain("privileged: true");
  });

  it("persists every owned datastore and prepares the shared token volume explicitly", () => {
    const bundled = source("docker/flowcordia-bundled.yml");

    for (const volume of [
      "postgres",
      "redis",
      "clickhouse",
      "minio",
      "registry",
      "s2",
      "s2-config",
      "shared",
    ]) {
      expect(bundled).toContain(`  ${volume}:`);
    }
    expect(bundled).toContain("chown -R 1000:1000 /home/node/shared");
    expect(bundled).toContain("condition: service_completed_successfully");
    expect(bundled).toContain("condition: service_healthy");
  });

  it("generates matching legacy and named S3 providers for the packets bucket", () => {
    const generator = source("docker/scripts/generate-flowcordia-bundled-secrets.sh");
    const environment = source("docker/flowcordia-bundled.env.example");
    const secrets = source("docker/flowcordia-bundled.secrets.example");

    for (const candidate of [generator, environment]) {
      expect(candidate).toContain("OBJECT_STORE_BUCKET=packets");
      expect(candidate).toContain("FLOWCORDIA_OBJECT_STORE_BUCKET=packets");
      expect(candidate).toContain("OBJECT_STORE_S3_BASE_URL=http://minio:9000");
      expect(candidate).toContain("OBJECT_STORE_S3_BUCKET=packets");
      expect(candidate).toContain("OBJECT_STORE_S3_REGION=us-east-1");
      expect(candidate).toContain("OBJECT_STORE_S3_SERVICE=s3");
    }
    expect(generator).toContain("OBJECT_STORE_S3_ACCESS_KEY_ID=$minio_access_key");
    expect(generator).toContain("OBJECT_STORE_S3_SECRET_ACCESS_KEY=$minio_secret_key");
    expect(secrets).toContain("OBJECT_STORE_S3_ACCESS_KEY_ID=<same-minio-access-key>");
    expect(secrets).toContain("OBJECT_STORE_S3_SECRET_ACCESS_KEY=<same-minio-secret-key>");
    expect(environment).not.toContain("OBJECT_STORE_BUCKET=flowcordia-packets");
  });

  it("allows doctor HTTP only for exact private bundled MinIO", () => {
    const exact = {
      FLOWCORDIA_BUNDLED_MODE: "1",
      OBJECT_STORE_BASE_URL: "http://minio:9000",
      OBJECT_STORE_BUCKET: "packets",
      OBJECT_STORE_FORCE_PATH_STYLE: "true",
    };
    expect(resolveFlowcordiaDoctorObjectStoreEndpoint(exact)?.toString()).toBe(
      "http://minio:9000/"
    );
    expect(
      resolveFlowcordiaDoctorObjectStoreEndpoint({
        ...exact,
        FLOWCORDIA_BUNDLED_MODE: "0",
      })
    ).toBeNull();
    expect(
      resolveFlowcordiaDoctorObjectStoreEndpoint({
        ...exact,
        OBJECT_STORE_BASE_URL: "http://storage:9000",
      })
    ).toBeNull();
    expect(
      resolveFlowcordiaDoctorObjectStoreEndpoint({ ...exact, OBJECT_STORE_BUCKET: "other" })
    ).toBeNull();
    expect(
      resolveFlowcordiaDoctorObjectStoreEndpoint({
        FLOWCORDIA_BUNDLED_MODE: "0",
        OBJECT_STORE_BASE_URL: "https://s3.example.com",
      })?.toString()
    ).toBe("https://s3.example.com/");
  });

  it("generates protected independent secrets and composes only through an additive overlay", () => {
    const generator = source("docker/scripts/generate-flowcordia-bundled-secrets.sh");
    const wrapper = source("docker/scripts/flowcordia-bundled.sh");

    expect(generator).toContain("Bundled deployment files must be stored outside the repository");
    expect(generator).toContain("openssl rand -hex");
    expect(generator).toContain("httpd:2.4-alpine");
    expect(generator).toContain("chmod 0600");
    expect(generator).not.toContain("set -x");
    expect(wrapper).toContain("docker/flowcordia-self-host.yml");
    expect(wrapper).toContain("docker/flowcordia-bundled.yml");
    expect(wrapper).toContain('--env-file "$config_path"');
    expect(wrapper).toContain('--env-file "$secrets_path"');
    expect(wrapper).not.toContain("down -v");
  });

  it("documents persistence, destructive deletion, backups, and the external-service escape hatch", () => {
    const runbook = source("flowcordia/runbooks/bundled-self-host-deployment.md");
    const environment = source("docker/flowcordia-bundled.env.example");

    expect(runbook).toContain("docker compose down -v");
    expect(runbook).toContain("permanent deletion");
    expect(runbook).toContain("Backup requirements");
    expect(runbook).toContain("When to move to external services");
    expect(runbook).toContain("one-VPS open-source installations");
    expect(runbook).toContain("canonical `packets` bucket");
    expect(environment).toContain("OBJECT_STORE_BASE_URL=http://minio:9000");
    expect(environment).toContain("REALTIME_STREAMS_S2_ENDPOINT=http://s2/v1");
    expect(environment).toContain("REDIS_HOST=redis");
  });
});
