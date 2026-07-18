import { createHash } from "node:crypto";
import {
  validateGitHubRepositorySourcePatches,
  type GitHubRepositorySourcePatch,
} from "@flowcordia/github-workflows";

export function canonicalSourcePatchIdentity(value: unknown): {
  patches: readonly GitHubRepositorySourcePatch[];
  digest: string;
} {
  const validation = validateGitHubRepositorySourcePatches(value);
  if (!validation.success) {
    throw new TypeError(
      validation.issues[0]?.message ?? "Repository source patches are invalid."
    );
  }
  const digest = createHash("sha256")
    .update(
      JSON.stringify(
        validation.patches.map((patch) => ({
          path: patch.path,
          expectedBlobSha: patch.expectedBlobSha,
          sourceSha256: createHash("sha256").update(patch.sourceText, "utf8").digest("hex"),
        }))
      ),
      "utf8"
    )
    .digest("hex");
  return { patches: validation.patches, digest };
}
