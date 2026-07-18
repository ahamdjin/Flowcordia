import { createHash } from "node:crypto";

export function workflowSourceProposalId(input: {
  draftPublicId: string;
  draftVersion: bigint;
  workflowSha256: string;
  sourceDigest: string;
}): string {
  const identity = createHash("sha256")
    .update(
      JSON.stringify({
        draftPublicId: input.draftPublicId,
        draftVersion: input.draftVersion.toString(),
        workflowSha256: input.workflowSha256,
        sourceDigest: input.sourceDigest,
      }),
      "utf8"
    )
    .digest("hex");
  return `studio-s-${identity}`;
}
