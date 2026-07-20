import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assembleFlowcordiaReleaseManifestFromEnvironment } from "../../../../scripts/flowcordia-assemble-release-evidence";
import {
  applicationCommitSha,
  assembledAt,
  proposalId,
  releaseEvidenceSources,
  releaseId,
  workflowId,
} from "./releaseEvidenceFixture";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "flowcordia-release-evidence-"));
  temporaryDirectories.push(root);
  const evidenceRoot = join(root, "evidence");
  const outputPath = join(root, "output", "manifest.json");
  const sources = releaseEvidenceSources();
  const environment: Record<string, string> = {
    FLOWCORDIA_RELEASE_EVIDENCE_ROOT: evidenceRoot,
    FLOWCORDIA_RELEASE_OUTPUT_PATH: outputPath,
    FLOWCORDIA_RELEASE_ID: releaseId,
    FLOWCORDIA_RELEASE_APPLICATION_COMMIT_SHA: applicationCommitSha,
    FLOWCORDIA_RELEASE_WORKFLOW_ID: workflowId,
    FLOWCORDIA_RELEASE_PROPOSAL_ID: proposalId,
    FLOWCORDIA_RELEASE_ASSEMBLED_AT: assembledAt,
  };

  for (const source of sources) {
    const directory = join(evidenceRoot, source.stage);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, "evidence.json"), `${JSON.stringify(source.evidence)}\n`, {
      mode: 0o600,
    });
    const prefix = `FLOWCORDIA_RELEASE_${source.stage.toUpperCase()}`;
    environment[`${prefix}_RUN_ID`] = source.runId;
    environment[`${prefix}_RUN_ATTEMPT`] = String(source.runAttempt);
    environment[`${prefix}_WORKFLOW_PATH`] = source.workflowPath;
    environment[`${prefix}_WORKFLOW_COMMIT_SHA`] = source.workflowCommitSha;
    environment[`${prefix}_ARTIFACT`] = source.artifactName;
    environment[`${prefix}_ARTIFACT_ARCHIVE_SHA256`] = source.artifactArchiveSha256;
  }
  return { root, evidenceRoot, outputPath, environment, sources };
}

describe("Flowcordia release evidence assembly command", () => {
  it("assembles exact source metadata and writes one private manifest atomically", async () => {
    const input = await fixture();
    const manifest = await assembleFlowcordiaReleaseManifestFromEnvironment(input.environment);
    const output = JSON.parse(await readFile(input.outputPath, "utf8")) as typeof manifest;

    expect(output).toEqual(manifest);
    expect(output.result).toBe("ACCEPTED");
    expect(output.sourceRuns).toHaveLength(5);
    expect(output.sourceRuns[0]).toMatchObject({
      stage: "preview",
      runId: "101",
      runAttempt: 1,
      workflowCommitSha: input.sources[0]!.workflowCommitSha,
      artifactName: input.sources[0]!.artifactName,
      artifactArchiveSha256: input.sources[0]!.artifactArchiveSha256,
    });
    const previewBytes = await readFile(join(input.evidenceRoot, "preview", "evidence.json"));
    expect(output.sourceRuns[0]!.evidenceSha256).toBe(
      createHash("sha256").update(previewBytes).digest("hex")
    );
    expect((await stat(input.outputPath)).mode & 0o777).toBe(0o600);
  });

  it("refuses to place output inside the untrusted evidence tree", async () => {
    const input = await fixture();
    input.environment.FLOWCORDIA_RELEASE_OUTPUT_PATH = join(input.evidenceRoot, "manifest.json");

    await expect(
      assembleFlowcordiaReleaseManifestFromEnvironment(input.environment)
    ).rejects.toThrow("outside the evidence input tree");
  });

  it("requires one regular evidence.json file per stage", async () => {
    const input = await fixture();
    await writeFile(join(input.evidenceRoot, "preview", "extra.json"), "{}", { mode: 0o600 });

    await expect(
      assembleFlowcordiaReleaseManifestFromEnvironment(input.environment)
    ).rejects.toThrow("exactly one regular evidence.json");
  });

  it("rejects evidence larger than the protected writer boundary", async () => {
    const input = await fixture();
    await writeFile(
      join(input.evidenceRoot, "preview", "evidence.json"),
      JSON.stringify({ value: "x".repeat(33 * 1024) }),
      { mode: 0o600 }
    );

    await expect(
      assembleFlowcordiaReleaseManifestFromEnvironment(input.environment)
    ).rejects.toThrow("exceeds 32 KiB");
  });

  it("fails closed when source-run metadata is not exact", async () => {
    const input = await fixture();
    input.environment.FLOWCORDIA_RELEASE_PREVIEW_WORKFLOW_PATH = ".github/workflows/untrusted.yml";

    await expect(
      assembleFlowcordiaReleaseManifestFromEnvironment(input.environment)
    ).rejects.toThrow("preview.workflowPath");
  });

  it("never overwrites an existing durable output path", async () => {
    const input = await fixture();
    await assembleFlowcordiaReleaseManifestFromEnvironment(input.environment);

    await expect(
      assembleFlowcordiaReleaseManifestFromEnvironment(input.environment)
    ).rejects.toThrow("could not be committed atomically");
  });

  it("uses a protected main-only workflow and a short-lived proposal token", () => {
    const workflow = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../.github/workflows/flowcordia-assemble-release-evidence.yml",
          import.meta.url
        )
      ),
      "utf8"
    );

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain("environment: flowcordia-release-evidence");
    expect(workflow).toContain("permissions: {}");
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain('run.event !== "workflow_dispatch"');
    expect(workflow).toContain('run.head_branch !== "main"');
    expect(workflow).toContain("run.repository?.full_name !== process.env.GITHUB_REPOSITORY");
    expect(workflow).toContain("run.path !== process.env.EXPECTED_WORKFLOW_PATH");
    expect(workflow).toContain("artifacts.total_count !== 1");
    expect(workflow).toContain("artifact.size_in_bytes > 65536");
    expect(workflow).toContain("artifact.workflow_run?.head_sha !== run.head_sha");
    expect(workflow).toContain(
      "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1"
    );
    expect(workflow).toContain("permission-contents: write");
    expect(workflow).toContain("permission-pull-requests: write");
    expect(workflow).toContain("--draft");
    expect(workflow).toContain('target="flowcordia/evidence/releases/$FLOWCORDIA_RELEASE_ID.json"');
    expect(workflow).toContain('branch="release-evidence/$FLOWCORDIA_RELEASE_ID"');
    expect(workflow).not.toContain("evidence_sources_json");
    expect(workflow).not.toMatch(/git push origin (main|HEAD:refs\/heads\/main)/);
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("on:\n  push:");
  });
});
