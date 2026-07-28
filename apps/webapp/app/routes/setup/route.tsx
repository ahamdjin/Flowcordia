import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { LinkButton } from "~/components/primitives/Buttons";
import { Header1, Header2 } from "~/components/primitives/Headers";
import { Paragraph } from "~/components/primitives/Paragraph";
import { prisma } from "~/db.server";
import { env } from "~/env.server";
import { featuresForRequest } from "~/features.server";
import { getFlowcordiaSetupStatuses } from "~/features/flowcordia/setup/configuration.server";
import { getFlowcordiaGitHubAppConfigurationStatus } from "~/features/flowcordia/setup/githubAppConfiguration.server";
import { getFirstOwnerState } from "~/features/flowcordia/setup/firstOwner.server";
import { requireUser } from "~/services/session.server";

export const meta: MetaFunction = () => [{ title: "Flowcordia setup" }];

export async function loader({ request }: LoaderFunctionArgs) {
  if (featuresForRequest(request).isManagedCloud) {
    throw redirect("/");
  }

  const user = await requireUser(request);
  if (!user.admin || user.isImpersonating) {
    throw new Response("Not found", { status: 404 });
  }

  const ownerState = await getFirstOwnerState();
  const githubApp = await getFlowcordiaGitHubAppConfigurationStatus();
  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id },
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
            select: { id: true, slug: true, name: true },
          },
        },
      },
    },
  });

  const statuses = getFlowcordiaSetupStatuses(env, {
    isSelfHosted: true,
    githubAppConfigured: githubApp !== null,
  });
  const organization = membership?.organization;
  const project = organization?.projects[0];

  const nextAction = !organization
    ? {
        label: "Create organization",
        to: "/orgs/new",
        description: "Create the first workspace and make this administrator its owner.",
      }
    : !project
      ? {
          label: "Create project",
          to: `/orgs/${organization.slug}/projects/new`,
          description: "Create the first project and its development and production environments.",
        }
      : {
          label: "Configure platform connections",
          to: `/orgs/${organization.slug}/settings/flowcordia-setup`,
          description: "Configure email and GitHub, then connect the first repository.",
        };

  return typedjson(
    {
      ownerClaimed: ownerState.claimed,
      statuses,
      organization: organization ? { slug: organization.slug, title: organization.title } : null,
      project: project ? { slug: project.slug, name: project.name } : null,
      nextAction,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export default function SetupHubPage() {
  const { ownerClaimed, statuses, organization, project, nextAction } =
    useTypedLoaderData<typeof loader>();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-6 md:p-10">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-300">
          Self-host first run
        </p>
        <Header1 className="mt-2">Set up Flowcordia</Header1>
        <Paragraph variant="base" className="mt-3 max-w-3xl">
          Complete each platform prerequisite before connecting a repository and deploying the first
          workflow.
        </Paragraph>
      </div>

      <section className="rounded-lg border border-grid-bright bg-background-bright p-5">
        <div className="flex items-start gap-3">
          {ownerClaimed ? (
            <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-green-400" />
          ) : (
            <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-300" />
          )}
          <div>
            <Header2>Installation owner</Header2>
            <Paragraph variant="small" className="mt-1">
              {ownerClaimed
                ? "The first platform administrator has been claimed and can sign in with a local password."
                : "No platform administrator has claimed this installation."}
            </Paragraph>
          </div>
        </div>
      </section>

      <section>
        <Header2>Platform readiness</Header2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {statuses.map((status) => {
            const ready = status.status === "present" || status.status === "detected";
            return (
              <div
                key={status.id}
                className="rounded-lg border border-grid-bright bg-background-bright p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-text-bright">{status.name}</p>
                    <p className="mt-1 text-sm leading-6 text-text-dimmed">{status.description}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-xs ${
                      ready
                        ? "border-green-500/30 bg-green-500/10 text-green-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {ready ? "Ready" : "Needs setup"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-5">
        <Header2>Next step</Header2>
        <Paragraph variant="small" className="mt-2">
          {nextAction.description}
        </Paragraph>
        <div className="mt-4">
          <LinkButton to={nextAction.to} variant="primary/medium">
            {nextAction.label}
          </LinkButton>
        </div>
        {(organization || project) && (
          <p className="mt-3 text-xs text-text-dimmed">
            {organization ? `Organization: ${organization.title}` : ""}
            {project ? ` · Project: ${project.name}` : ""}
          </p>
        )}
      </section>
    </main>
  );
}
