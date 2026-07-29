import { prisma } from "~/db.server";
import { createOrganization } from "~/models/organization.server";
import { createProject } from "~/models/project.server";

export const SELF_HOST_FIRST_RUN_WORKSPACE_NAME = "My workspace";
export const SELF_HOST_FIRST_RUN_PROJECT_NAME = "My workflows";

export type SelfHostFirstRunTarget = {
  organization: {
    id: string;
    slug: string;
    title: string;
  };
  project: {
    id: string;
    slug: string;
    name: string;
    productionEnvironmentSlug: string;
  };
};

export async function getSelfHostFirstRunTarget(
  userId: string
): Promise<SelfHostFirstRunTarget | null> {
  const membership = await prisma.orgMember.findFirst({
    where: {
      userId,
      organization: { deletedAt: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      organization: {
        select: {
          id: true,
          slug: true,
          title: true,
          projects: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              id: true,
              slug: true,
              name: true,
              environments: {
                where: { type: "PRODUCTION", archivedAt: null },
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { slug: true },
              },
            },
          },
        },
      },
    },
  });

  const organization = membership?.organization;
  const project = organization?.projects[0];
  if (!organization || !project) return null;

  return {
    organization: {
      id: organization.id,
      slug: organization.slug,
      title: organization.title,
    },
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      productionEnvironmentSlug: project.environments[0]?.slug ?? "prod",
    },
  };
}

export async function ensureSelfHostFirstRunTarget(
  userId: string
): Promise<SelfHostFirstRunTarget> {
  const existing = await getSelfHostFirstRunTarget(userId);
  if (existing) return existing;

  let membership = await prisma.orgMember.findFirst({
    where: {
      userId,
      organization: { deletedAt: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      organization: {
        select: {
          slug: true,
          projects: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });

  if (!membership) {
    const organization = await createOrganization({
      title: SELF_HOST_FIRST_RUN_WORKSPACE_NAME,
      userId,
      companySize: null,
    });
    membership = {
      organization: {
        slug: organization.slug,
        projects: [],
      },
    };
  }

  if (membership.organization.projects.length === 0) {
    await createProject({
      organizationSlug: membership.organization.slug,
      name: SELF_HOST_FIRST_RUN_PROJECT_NAME,
      userId,
      version: "v3",
    });
  }

  const target = await getSelfHostFirstRunTarget(userId);
  if (!target) {
    throw new Error("Flowcordia could not prepare the first workspace and project.");
  }

  return target;
}
