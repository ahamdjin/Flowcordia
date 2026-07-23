import { prisma } from "~/db.server";
import type { LoaderFunction } from "@remix-run/node";
import { env } from "~/env.server";
import { assertFlowcordiaReleaseRuntimeIdentity } from "~/features/flowcordia/operations/release-runtime.server";
import { rbac } from "~/services/rbac.server";

export const loader: LoaderFunction = async ({ request }) => {
  try {
    // Keep readiness tied to the same immutable release identity that was
    // verified before startup. This remains a no-op for ordinary development
    // and inherited deployments where release enforcement is explicitly off.
    assertFlowcordiaReleaseRuntimeIdentity();

    // Resolve the lazy plugin controller so plugin-load failures surface
    // during readiness probes. With REQUIRE_PLUGINS=1, a failed plugin
    // load throws here and the rollout's readiness probe fails. The
    // fallback path doesn't touch the DB, so this runs even when
    // HEALTHCHECK_DATABASE_DISABLED=1 — REQUIRE_PLUGINS protection must
    // not be silently bypassed by the DB-disabled flag.
    await rbac.isUsingPlugin();

    if (env.HEALTHCHECK_DATABASE_DISABLED === "1") {
      return new Response("OK");
    }

    await prisma.$queryRaw`SELECT 1`;

    return new Response("OK");
  } catch (error: unknown) {
    console.log("healthcheck ❌", { error });
    return new Response("ERROR", { status: 500 });
  }
};
