import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUpstreamDriftReport,
  classifyPath,
  parseArguments,
  parseNameStatus,
  parseOwnershipManifest,
  run,
} from "./flowcordia-upstream-drift.mjs";

const manifest = parseOwnershipManifest(
  JSON.stringify({
    schemaVersion: "0.1",
    productOwnedPrefixes: ["flowcordia/", "packages/flowcordia-"],
    reviewedAdapterPaths: ["apps/webapp/app/env.server.ts"],
    reviewedAdapterPrefixes: ["apps/webapp/app/routes/resources.orgs."],
  })
);

test("classifies Flowcordia, reviewed adapter, and inherited core paths", () => {
  assert.equal(classifyPath("flowcordia/product/roadmap.md", manifest), "flowcordia_owned");
  assert.equal(
    classifyPath("packages/flowcordia-runtime/src/runtime.ts", manifest),
    "flowcordia_owned"
  );
  assert.equal(classifyPath("apps/webapp/app/env.server.ts", manifest), "reviewed_adapter");
  assert.equal(
    classifyPath("apps/webapp/app/routes/resources.orgs.$slug.flowcordia.ts", manifest),
    "reviewed_adapter"
  );
  assert.equal(classifyPath("packages/core/src/index.ts", manifest), "inherited_core");
});

test("preserves both sides of rename evidence", () => {
  assert.deepEqual(parseNameStatus("M\tflowcordia/README.md\nR100\told.ts\tnew.ts\n"), [
    { status: "M", path: "flowcordia/README.md", role: "current" },
    { status: "R100", path: "old.ts", role: "previous" },
    { status: "R100", path: "new.ts", role: "current" },
  ]);
});

test("returns a stop-worthy decision when inherited core changes", () => {
  const report = buildUpstreamDriftReport({
    base: "upstream/main",
    head: "HEAD",
    manifest,
    entries: [
      { status: "M", path: "flowcordia/README.md", role: "current" },
      { status: "M", path: "apps/webapp/app/env.server.ts", role: "current" },
      { status: "M", path: "packages/core/src/index.ts", role: "current" },
    ],
  });
  assert.deepEqual(report.counts, {
    flowcordia_owned: 1,
    reviewed_adapter: 1,
    inherited_core: 1,
  });
  assert.equal(report.decision, "REVIEW_REQUIRED");
});

test("requires explicit bounded refs", () => {
  assert.throws(() => parseArguments([]), /--base is required/);
  assert.throws(() => parseArguments(["--base", "main;rm"]), /invalid format/);
  assert.deepEqual(parseArguments(["--base", "upstream/main", "--json", "--fail-on-core"]), {
    base: "upstream/main",
    head: "HEAD",
    manifest: "flowcordia/architecture/upstream-ownership.json",
    json: true,
    failOnCore: true,
  });
});

test("fails closed without leaking raw git errors", () => {
  let output = "";
  assert.throws(
    () =>
      run(["--base", "upstream/main"], {
        readFileSync: () => JSON.stringify(manifest),
        executeGitDiff: () => {
          throw new Error("secret remote URL");
        },
        stdout: { write: (value) => (output += value) },
      }),
    /secret remote URL/
  );
  assert.equal(output, "");
});

test("emits bounded JSON and returns 2 only for the explicit inherited-core gate", () => {
  let output = "";
  const exitCode = run(["--base", "upstream/main", "--json", "--fail-on-core"], {
    readFileSync: () => JSON.stringify(manifest),
    executeGitDiff: () => "M\tpackages/core/src/index.ts\n",
    stdout: { write: (value) => (output += value) },
  });
  assert.equal(exitCode, 2);
  const parsed = JSON.parse(output);
  assert.equal(parsed.decision, "REVIEW_REQUIRED");
  assert.equal(parsed.changedPaths[0].ownership, "inherited_core");
});
