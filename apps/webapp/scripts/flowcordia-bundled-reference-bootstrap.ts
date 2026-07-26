import { AuthenticationMethod } from "@trigger.dev/database";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "../app/db.server";
import { createApiKeyForEnv, createPkApiKeyForEnv } from "../app/models/api-key.server";
import { createPersonalAccessToken } from "../app/services/personalAccessToken.server";

const OUTPUT_FLAG = "--output";
const USER_EMAIL = "flowcordia-beta-reference@localhost.invalid";
const ORGANIZATION_SLUG = "flowcordia-beta-reference";
const PROJECT_SLUG = "flowcordia-beta-reference";
const PROJECT_REF = "proj_flowcordiabetareference";

function outputPath(): string {
  const index = process.argv.indexOf(OUTPUT_FLAG);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error("Usage: flowcordia-bundled-reference-bootstrap.ts --output <absolute-path>");
  }
  const path = resolve(process.argv[index + 1]);
  if (!path.startsWith("/")) throw new Error("Bootstrap output must be an absolute path.");
  return path;
}

async function main() {
  const path = outputPath();
  const existing = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (existing) {
    throw new Error(
      "The bundled reference installation is not clean: bootstrap user already exists."
    );
  }

  const user = await prisma.user.create({
    data: {
      email: USER_EMAIL,
      authenticationMethod: AuthenticationMethod.MAGIC_LINK,
      name: "Flowcordia Beta Reference",
      displayName: "Flowcordia Beta Reference",
      admin: true,
      confirmedBasicDetails: true,
    },
  });

  const organization = await prisma.organization.create({
    data: {
      slug: ORGANIZATION_SLUG,
      title: "Flowcordia Beta Reference",
      companySize: "1-10",
      v3Enabled: true,
      members: { create: { userId: user.id, role: "ADMIN" } },
    },
  });

  const project = await prisma.project.create({
    data: {
      slug: PROJECT_SLUG,
      name: "Flowcordia Beta Reference",
      externalRef: PROJECT_REF,
      organizationId: organization.id,
      version: "V3",
      engine: "V2",
    },
  });

  const environment = await prisma.runtimeEnvironment.create({
    data: {
      slug: "prod",
      apiKey: createApiKeyForEnv("PRODUCTION"),
      pkApiKey: createPkApiKeyForEnv("PRODUCTION"),
      shortcode: "beta-reference-prod",
      type: "PRODUCTION",
      maximumConcurrencyLimit: 5,
      organizationId: organization.id,
      projectId: project.id,
      isBranchableEnvironment: false,
      autoEnableInternalSources: true,
    },
  });

  const defaultGroupFlag = await prisma.featureFlag.findUnique({
    where: { key: "defaultWorkerInstanceGroupId" },
  });
  if (typeof defaultGroupFlag?.value === "string") {
    await prisma.project.update({
      where: { id: project.id },
      data: { defaultWorkerGroupId: defaultGroupFlag.value },
    });
  }

  const personalAccessToken = await createPersonalAccessToken({
    name: "flowcordia-beta-bundled-execution",
    userId: user.id,
  });

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        schemaVersion: "0.1",
        projectRef: project.externalRef,
        environmentApiKey: environment.apiKey,
        personalAccessToken: personalAccessToken.token,
        organizationId: organization.id,
        projectId: project.id,
        environmentId: environment.id,
      },
      null,
      2
    )}\n`,
    { mode: 0o600, flag: "wx" }
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Bundled reference bootstrap failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
