import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const zizmorSha = "6599ee8b7a49aef6a770f63d261d214911a7ce02";

function repositorySource(path: string): string {
  return fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
}

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

describe("Flowcordia GitHub Actions security baseline", () => {
  it("owns Zizmor 0.6 and lockfile-backed npm trusted publishing", async () => {
    const [workflow, release, packageSource, policy] = await Promise.all([
      readFile(repositorySource(".github/workflows/workflow-checks.yml"), "utf8"),
      readFile(repositorySource(".github/workflows/release.yml"), "utf8"),
      readFile(repositorySource("package.json"), "utf8"),
      readFile(repositorySource("flowcordia/security/github-actions-upgrade-policy.md"), "utf8"),
    ]);
    const packageManifest = JSON.parse(packageSource) as {
      devDependencies?: Record<string, string>;
    };

    expect(occurrences(workflow, zizmorSha)).toBe(2);
    expect(occurrences(workflow, "min-severity: low")).toBe(2);
    expect(packageManifest.devDependencies?.npm).toBe("11.6.4");
    expect(release).not.toContain("npm install -g");
    expect(occurrences(release, "Verify lockfile-owned npm for OIDC")).toBe(2);
    expect(occurrences(release, 'npm_bin_dir="$(pnpm bin)"')).toBe(2);
    expect(occurrences(release, 'echo "$npm_bin_dir" >> "$GITHUB_PATH"')).toBe(2);
    expect(policy).toContain("Zizmor `v0.6.0` is the enforced scanner baseline");
    expect(policy).not.toContain("`v0.5.6` retained");
  });
});
