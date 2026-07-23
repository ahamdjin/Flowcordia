#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";

const path = "/tmp/flowcordia/operations-health.json";
const SHA = /^[0-9a-f]{40}$/;

function fail() {
  console.error("Flowcordia operations health: UNAVAILABLE");
  process.exit(1);
}

try {
  const information = await lstat(path);
  if (
    information.isSymbolicLink() ||
    !information.isFile() ||
    information.size < 2 ||
    information.size > 1024 ||
    Date.now() - information.mtimeMs > 45_000
  ) {
    fail();
  }
  const value = JSON.parse(await readFile(path, "utf8"));
  const checkedAt = new Date(value.checkedAt);
  if (
    value.schemaVersion !== "0.1" ||
    value.state !== "READY" ||
    !SHA.test(value.applicationCommitSha ?? "") ||
    !Number.isFinite(checkedAt.getTime()) ||
    checkedAt.toISOString() !== value.checkedAt ||
    Date.now() - checkedAt.getTime() > 45_000 ||
    value.applicationCommitSha !== process.env.FLOWCORDIA_APPLICATION_COMMIT_SHA
  ) {
    fail();
  }
  console.log("Flowcordia operations health: READY");
} catch {
  fail();
}
