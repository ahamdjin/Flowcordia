import { copyFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = path.resolve(appRoot, "../..");
const target = path.join(repositoryRoot, "tsconfig.base.json");
const source = path.join(appRoot, "activepieces-tsconfig.base.json");
if (existsSync(target)) throw new Error("A root tsconfig.base.json already exists.");
copyFileSync(source, target);
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error("A command is required.");
  const result = spawnSync(command, args, {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(target, { force: true });
}
