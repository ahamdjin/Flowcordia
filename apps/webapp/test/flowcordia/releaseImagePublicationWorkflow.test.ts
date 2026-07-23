import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

describe("Flowcordia self-host image publication workflow", () => {
  it("is protected, main-only, exact-head, and least-privileged", () => {
    const workflow = source(".github/workflows/flowcordia-publish-self-host-image.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain("environment: flowcordia-self-host-release");
    expect(workflow).toContain("group: flowcordia-self-host-version-${{ inputs.version }}");
    expect(workflow).toContain("permissions: {}");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("packages: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("attestations: write");
    expect(workflow).not.toContain("artifact-metadata: write");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("on:\n  push:");
  });

  it("publishes one no-overwrite immutable amd64 image with SBOM and provenance", () => {
    const workflow = source(".github/workflows/flowcordia-publish-self-host-image.yml");

    expect(workflow).toContain('image_name="ghcr.io/${repository}"');
    expect(workflow).toContain('docker buildx imagetools inspect "$image_name:$version"');
    expect(workflow).toContain("Release version tag already exists and cannot be overwritten.");
    expect(workflow).toContain("Upstream revision cannot be a repeated placeholder.");
    expect(workflow).toContain("--platform linux/amd64");
    expect(workflow).toContain("--provenance=mode=max");
    expect(workflow).toContain("--sbom=true");
    expect(workflow).toContain("--metadata-file /tmp/flowcordia-image-metadata.json");
    expect(workflow).toContain(
      "--secret id=sentry_auth_token,src=/tmp/flowcordia-empty-sentry-token"
    );
    expect(workflow).toContain('--build-arg BUILD_APP_VERSION="$version"');
    expect(workflow).toContain('--build-arg BUILD_GIT_SHA="$GITHUB_SHA"');
    expect(workflow).toContain('--build-arg BUILD_UPSTREAM_GIT_SHA="$upstream_sha"');
    expect(workflow).toContain("--file docker/Dockerfile");
    expect(workflow).toContain("containerimage.digest");
  });

  it("creates and verifies a GitHub-signed SLSA attestation before evidence", () => {
    const workflow = source(".github/workflows/flowcordia-publish-self-host-image.yml");

    expect(workflow).toContain("actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6");
    expect(workflow).toContain("subject-name: ${{ steps.build.outputs.image_name }}");
    expect(workflow).toContain("subject-digest: ${{ steps.build.outputs.image_digest }}");
    expect(workflow).toContain("push-to-registry: true");
    expect(workflow).toContain("create-storage-record: false");
    expect(workflow).toContain("gh attestation verify");
    expect(workflow).toContain('--repo "$GITHUB_REPOSITORY"');
    expect(workflow).toContain(
      '--signer-workflow "$GITHUB_REPOSITORY/.github/workflows/flowcordia-publish-self-host-image.yml"'
    );
    expect(workflow).toContain('--source-digest "$GITHUB_SHA"');
    expect(workflow).toContain("--source-ref refs/heads/main");
    expect(workflow).toContain("--deny-self-hosted-runners");
    expect(workflow.indexOf("gh attestation verify")).toBeLessThan(
      workflow.indexOf("flowcordia:release:image-evidence")
    );
  });

  it("creates bounded manifest/evidence artifacts and cleans credentials", () => {
    const workflow = source(".github/workflows/flowcordia-publish-self-host-image.yml");

    expect(workflow).toContain("pnpm flowcordia:release:manifest");
    expect(workflow).toContain("pnpm flowcordia:release:image-evidence");
    expect(workflow).toContain("flowcordia-self-host-image-${{ inputs.release_id }}");
    expect(workflow).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
    expect(workflow).toContain("retention-days: 90");
    expect(workflow).toContain("docker logout ghcr.io");
    expect(workflow).toContain("docker buildx rm flowcordia-release-builder");
    expect(workflow).toContain("/tmp/flowcordia-empty-sentry-token");
  });

  it("labels the release image as Flowcordia with exact source revisions", () => {
    const dockerfile = source("docker/Dockerfile");

    expect(dockerfile).toContain("ARG BUILD_UPSTREAM_GIT_SHA");
    expect(dockerfile).toContain("ARG BUILD_SOURCE_REPOSITORY_URL");
    expect(dockerfile).toContain('org.opencontainers.image.title="Flowcordia"');
    expect(dockerfile).toContain(
      'org.opencontainers.image.source="${BUILD_SOURCE_REPOSITORY_URL}"'
    );
    expect(dockerfile).toContain('org.opencontainers.image.revision="${BUILD_GIT_SHA}"');
    expect(dockerfile).toContain('dev.flowcordia.upstream.revision="${BUILD_UPSTREAM_GIT_SHA}"');
  });
});
