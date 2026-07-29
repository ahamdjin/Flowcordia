import { readFileSync, writeFileSync } from "node:fs";

const packagePath = "package.json";
const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
const overrides = manifest?.pnpm?.overrides;
if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
  throw new Error("Root pnpm overrides are missing.");
}
const current = overrides["form-data@^4"];
if (current !== "4.0.4" && current !== "4.0.6") {
  throw new Error(`Unexpected form-data@^4 override: ${String(current)}`);
}
overrides["form-data@^4"] = "4.0.6";
writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
