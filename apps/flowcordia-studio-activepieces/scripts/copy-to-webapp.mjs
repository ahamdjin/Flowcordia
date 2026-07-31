import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = path.resolve(appRoot, "../..");
const source = path.join(appRoot, "dist");
const target = path.join(repositoryRoot, "apps/webapp/public/flowcordia-studio-activepieces");

if (!existsSync(source)) {
  throw new Error("Build the Flowcordia Activepieces Studio before copying its assets.");
}

rmSync(target, { recursive: true, force: true });
mkdirSync(path.dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });
