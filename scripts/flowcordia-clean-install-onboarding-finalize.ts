import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS } from "../apps/webapp/app/features/flowcordia/operations/clean-install-onboarding";

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
      observations: { type: "string" },
      output: { type: "string" },
      "completed-at": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const observationsPath = absolute(values.observations, "--observations");
  const outputPath = absolute(values.output, "--output");
  const completedAt = values["completed-at"] ?? new Date().toISOString();
  if (new Date(completedAt).toISOString() !== completedAt) {
    throw new Error("--completed-at must be an exact ISO timestamp.");
  }

  const value = JSON.parse(await readFile(observationsPath, "utf8")) as Record<string, unknown>;
  if (
    value.schemaVersion !== "0.1" ||
    value.kind !== "flowcordia-clean-install-onboarding-observations" ||
    !Array.isArray(value.journey) ||
    value.journey.length !== FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS.length
  ) {
    throw new Error("The browser observations are incomplete.");
  }
  const teardown = value.teardown;
  if (!teardown || typeof teardown !== "object" || Array.isArray(teardown)) {
    throw new Error("The browser observations do not contain teardown placeholders.");
  }
  const expected = [
    "containersAbsent",
    "networksAbsent",
    "volumesAbsent",
    "browserStateAbsent",
    "mailboxAbsent",
    "temporaryCredentialsAbsent",
  ];
  if (
    JSON.stringify(Object.keys(teardown as Record<string, unknown>).sort()) !==
      JSON.stringify(expected.sort()) ||
    Object.values(teardown as Record<string, unknown>).some((entry) => entry !== false)
  ) {
    throw new Error("Teardown must be unclaimed until the protected runner verifies cleanup.");
  }

  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        ...value,
        completedAt,
        teardown: {
          containersAbsent: true,
          networksAbsent: true,
          volumesAbsent: true,
          browserStateAbsent: true,
          mailboxAbsent: true,
          temporaryCredentialsAbsent: true,
        },
      },
      null,
      2
    )}\n`,
    { mode: 0o600, flag: "wx" }
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Onboarding teardown finalization failed.");
  process.exitCode = 1;
});
