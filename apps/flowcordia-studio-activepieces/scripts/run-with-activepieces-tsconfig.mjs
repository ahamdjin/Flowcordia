import { copyFileSync, existsSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = path.resolve(appRoot, "../..");
const target = path.join(repositoryRoot, "tsconfig.base.json");
const source = path.join(appRoot, "activepieces-tsconfig.base.json");
const upstreamNodeModules = path.join(repositoryRoot, "studio-v2/activepieces-web/node_modules");
const appNodeModules = path.join(appRoot, "node_modules");
let linkedUpstreamDependencies = false;

if (existsSync(target)) throw new Error("A root tsconfig.base.json already exists.");
if (!existsSync(appNodeModules)) {
  throw new Error("Install Studio dependencies before running this command.");
}
if (!existsSync(upstreamNodeModules)) {
  symlinkSync(
    appNodeModules,
    upstreamNodeModules,
    process.platform === "win32" ? "junction" : "dir"
  );
  linkedUpstreamDependencies = true;
}

copyFileSync(source, target);
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error("A command is required.");
  const result = spawnSync(command, args, {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(target, { force: true });
  if (linkedUpstreamDependencies) unlinkSync(upstreamNodeModules);
}
