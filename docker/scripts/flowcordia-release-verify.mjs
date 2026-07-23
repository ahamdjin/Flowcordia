#!/usr/bin/env node
import { verifyFlowcordiaReleaseProcess } from "./flowcordia-release-contract.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

try {
  const release = await verifyFlowcordiaReleaseProcess({
    path: process.env.FLOWCORDIA_RELEASE_MANIFEST_PATH,
    expectedManifestDigest: process.env.FLOWCORDIA_RELEASE_MANIFEST_SHA256,
    applicationCommitSha: process.env.FLOWCORDIA_APPLICATION_COMMIT_SHA,
    imageDigest: process.env.FLOWCORDIA_IMAGE_DIGEST,
    component: process.argv[2],
  });
  console.log("Flowcordia release process identity: READY");
  console.log(`Release: ${release.releaseId}`);
  console.log(`Component: ${process.argv[2]}`);
  console.log(`Application: ${release.applicationCommitSha}`);
  console.log(`Manifest: ${release.manifestSha256}`);
} catch {
  fail("Flowcordia release process identity is unavailable or invalid.");
}
