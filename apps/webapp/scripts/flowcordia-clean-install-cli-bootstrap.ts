import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { prisma } from "../app/db.server";
import { createPersonalAccessToken } from "../app/services/personalAccessToken.server";

function absolute(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required.`);
  const path = resolve(value);
  if (!path.startsWith("/")) throw new Error(`${label} must be absolute.`);
  return path;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "owner-email": { type: "string" },
      "project-name": { type: "string" },
      output: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const ownerEmail = (
    values["owner-email"] ?? process.env.FLOWCORDIA_ACCEPTANCE_OWNER_EMAIL
  )
    ?.trim()
    .toLowerCase();
  const projectName = (
    values["project-name"] ?? process.env.FLOWCORDIA_ACCEPTANCE_PROJECT_NAME
  )?.trim();
  const output = absolute(values.output, "--output");
  if (!ownerEmail || !projectName) throw new Error("Owner email and project name are required.");

  const user = await prisma.user.findFirst({
    where: { email: { equals: ownerEmail, mode: "insensitive" }, admin: true },
    select: { id: true },
  });
  if (!user) throw new Error("The browser-created installation owner was not found.");

  const project = await prisma.project.findFirst({
    where: {
      name: projectName,
      deletedAt: null,
      organization: {
        deletedAt: null,
        members: { some: { userId: user.id } },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      externalRef: true,
      organizationId: true,
      environments: {
        where: { type: "PRODUCTION", archivedAt: null },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, slug: true, apiKey: true },
      },
    },
  });
  const environment = project?.environments[0];
  if (!project || !environment) {
    throw new Error("The browser-created production project is incomplete.");
  }

  const personalAccessToken = await createPersonalAccessToken({
    name: "flowcordia-clean-install-onboarding",
    userId: user.id,
  });

  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(
    output,
    `${JSON.stringify(
      {
        schemaVersion: "0.1",
        projectRef: project.externalRef,
        projectId: project.id,
        organizationId: project.organizationId,
        environmentId: environment.id,
        environmentSlug: environment.slug,
        environmentApiKey: environment.apiKey,
        personalAccessToken: personalAccessToken.token,
      },
      null,
      2
    )}\n`,
    { mode: 0o600, flag: "wx" }
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Clean-install CLI bootstrap failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
