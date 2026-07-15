import { prisma } from "~/db.server";
import { env } from "~/env.server";
import { FEATURE_FLAG } from "~/v3/featureFlags";
import { makeFlag } from "~/v3/featureFlags.server";

/**
 * Server-side gate for the Studio surface. Navigation visibility is only a
 * convenience; every workspace loader calls this again before reading data.
 */
export async function canAccessFlowcordiaStudio(input: {
  userId: string;
  isAdmin: boolean;
  isImpersonating: boolean;
  organizationSlug: string;
}): Promise<boolean> {
  if (input.isAdmin || input.isImpersonating) return true;

  const organization = await prisma.organization.findFirst({
    where: {
      slug: input.organizationSlug,
      deletedAt: null,
      members: { some: { userId: input.userId } },
    },
    select: { featureFlags: true },
  });
  if (!organization) return false;

  const flag = makeFlag();
  return flag({
    key: FEATURE_FLAG.hasFlowcordiaStudioAccess,
    defaultValue: env.FLOWCORDIA_STUDIO_ENABLED === "1",
    overrides: (organization.featureFlags as Record<string, unknown> | null) ?? {},
  });
}
