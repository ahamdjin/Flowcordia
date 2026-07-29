import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  flowcordiaStudioPath,
  projectGitHubOnboardingPath,
} from "../app/features/flowcordia/setup/hostedCustomerOnboarding";

const webappRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(webappRoot, path), "utf8");
}

describe("hosted customer onboarding paths", () => {
  it("keeps the project target explicit throughout GitHub setup", () => {
    expect(
      projectGitHubOnboardingPath({
        organizationSlug: "acme team",
        projectSlug: "first/project",
      })
    ).toBe("/setup/github?organization=acme+team&project=first%2Fproject");
  });

  it("opens the production Studio without a dashboard detour", () => {
    expect(
      flowcordiaStudioPath({
        organizationSlug: "acme",
        projectSlug: "workflows",
      })
    ).toBe("/orgs/acme/projects/workflows/env/prod/flowcordia/workflows");
  });
});

describe("hosted customer onboarding source boundary", () => {
  it("creates the first workspace and project without a marketing survey", () => {
    const organization = source("app/routes/_app.orgs.new/route.tsx");
    expect(organization).toContain("Create your workspace");
    expect(organization).toContain("createProject");
    expect(organization).toContain("projectGitHubOnboardingPath");
    expect(organization).not.toContain("Number of employees");
    expect(organization).not.toContain('name="companyUrl"');
    expect(organization).not.toContain('name="companySize"');
  });

  it("reduces later hosted project creation to the project name", () => {
    const project = source("app/routes/_app.orgs.$organizationSlug_.projects.new/route.tsx");
    expect(project).toContain("!isManagedCloud");
    expect(project).toContain("projectGitHubOnboardingPath");
    expect(project).toContain('isManagedCloud ? "Continue" : "Create"');
    expect(project).not.toContain("Learn how Trigger works");
  });

  it("uses a project-scoped hosted GitHub setup and hides operator credentials", () => {
    const github = source("app/routes/setup.github/route.tsx");
    const platformSetup = source(
      "app/routes/_app.orgs.$organizationSlug.settings.flowcordia-setup/route.tsx"
    );

    expect(github).toContain("HostedTargetSearch");
    expect(github).toContain('role: "ADMIN"');
    expect(github).toContain("you do not need to create or configure one yourself");
    expect(github).toContain("Back to Studio");
    expect(platformSetup.match(/featuresForRequest\(request\)\.isManagedCloud/g)).toHaveLength(2);
  });
});
