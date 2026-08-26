#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const UPSTREAMS = [
  ["upstream-trigger", "https://github.com/triggerdotdev/trigger.dev.git"],
  ["upstream-activepieces", "https://github.com/activepieces/activepieces.git"],
];

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, {
    stdio: allowFailure ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed with status ${result.status ?? "unknown"}.`);
  }
  return result;
}

for (const [name, url] of UPSTREAMS) {
  const existing = git(["remote", "get-url", name], true);
  if (existing.status === 0) git(["remote", "set-url", name, url]);
  else git(["remote", "add", name, url]);
  git(["remote", "set-url", "--push", name, "DISABLED"]);
}

process.stdout.write("Configured fetch-only Trigger.dev and Activepieces upstream remotes.\n");
