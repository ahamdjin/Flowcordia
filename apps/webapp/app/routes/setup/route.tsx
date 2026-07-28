import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
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
import { getEmailConfigurationStatus } from "~/features/flowcordia/setup/emailConfiguration.server";
import { getFirstOwnerState } from "~/features/flowcordia/setup/firstOwner.server";
import { getFlowcordiaGitHubAppConfigurationStatus } from "~/features/flowcordia/setup/githubAppConfiguration.server";
import {
  getPlatformReadiness,
  type PlatformReadinessState,
} from "~/features/flowcordia/setup/platformReadiness.server";
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

  const url = new URL(request.url);
  const forceReadiness = url.searchParams.get("refresh") === "1";
  const [ownerState, githubApp, generalEmail, alertEmail, readiness, membership] =
    await Promise.all([
      getFirstOwnerState(),
      getFlowcordiaGitHubAppConfigurationStatus(),
      getEmailConfigurationStatus("general"),
      getEmailConfigurationStatus("alert"),
      getPlatformReadiness({ requestOrigin: url.origin, force: forceReadiness }),
      prisma.orgMember.findFirst({
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
      }),
    ]);

  const connectionStatuses = getFlowcordiaSetupStatuses(env, {
    isSelfHosted: true,
    githubAppConfigured: githubApp !== null,
    generalEmailConfigured: generalEmail.state === "configured",
    alertEmailConfigured: alertEmail.state === "configured",
  }).filter((status) =>
    ["github-app", "general-email", "alert-email", "self-host-mode"].includes(status.id)
  );
  const organization = membership?.organization;
  const project = organization?.projects[0];
  const platformReady = readiness.every((item) => item.state === "ready");
  const generalEmailReady = generalEmail.state === "configured";

  const nextAction = !platformReady
    ? {
        label: "Re-run readiness checks",
        to: "/setup?refresh=1",
        description:
          "Resolve every recovery action under Platform readiness. Flowcordia will not treat this installation as ready while a required service is missing, misconfigured, or unreachable.",
      }
    : !generalEmailReady
      ? {
          label: "Configure email",
          to: "/setup/email",
          description:
            "Configure and test general email so invitations, sign-in recovery, and the second-user acceptance journey can work.",
        }
      : !organization
        ? {
            label: "Create organization",
            to: "/orgs/new",
            description: "Create the first workspace and make this administrator its owner.",
          }
        : !project
          ? {
              label: "Create project",
              to: `/orgs/${organization.slug}/projects/new`,
              description:
                "Create the first project and its development and production environments.",
            }
          : {
              label: "Configure GitHub",
              to: `/orgs/${organization.slug}/settings/flowcordia-setup`,
              description:
                "Configure the GitHub App, install it for the organization, and connect the first repository.",
            };

  return typedjson(
    {
      ownerClaimed: ownerState.claimed,
      readiness,
      platformReady,
      connectionStatuses,
      organization: organization ? { slug: organization.slug, title: organization.title } : null,
      project: project ? { slug: project.slug, name: project.name } : null,
      nextAction,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function readinessPresentation(state: PlatformReadinessState) {
  switch (state) {
    case "ready":
      return {
        label: "Ready",
        className: "border-green-500/30 bg-green-500/10 text-green-300",
        Icon: CheckCircleIcon,
        iconClassName: "text-green-400",
      };
    case "not-configured":
      return {
        label: "Not configured",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-200",
        Icon: ExclamationTriangleIcon,
        iconClassName: "text-amber-300",
      };
    case "misconfigured":
      return {
        label: "Misconfigured",
        className: "border-red-500/30 bg-red-500/10 text-red-200",
        Icon: XCircleIcon,
        iconClassName: "text-red-300",
      };
    case "unreachable":
      return {
        label: "Unreachable",
        className: "border-red-500/30 bg-red-500/10 text-red-200",
        Icon: XCircleIcon,
        iconClassName: "text-red-300",
      };
  }
}

export default function SetupHubPage() {
  const {
    ownerClaimed,
    readiness,
    platformReady,
    connectionStatuses,
    organization,
    project,
    nextAction,
  } = useTypedLoaderData<typeof loader>();

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Header2>Platform readiness</Header2>
            <Paragraph variant="small" className="mt-1">
              These are live, bounded checks. Presence of an environment variable alone is not
              treated as proof that a service works.
            </Paragraph>
          </div>
          <LinkButton to="/setup?refresh=1" variant="secondary/small" LeadingIcon={ArrowPathIcon}>
            Run checks again
          </LinkButton>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {readiness.map((item) => {
            const presentation = readinessPresentation(item.state);
            return (
              <div
                key={item.id}
                className="rounded-lg border border-grid-bright bg-background-bright p-4"
              >
                <div className="flex items-start gap-3">
                  <presentation.Icon
                    className={`mt-0.5 size-5 shrink-0 ${presentation.iconClassName}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-text-bright">{item.name}</p>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-1 text-xs ${presentation.className}`}
                      >
                        {presentation.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-dimmed">{item.summary}</p>
                    {item.recovery && (
                      <div className="mt-3 rounded border border-grid-dimmed bg-background-dimmed p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-text-dimmed">
                          Recovery
                        </p>
                        <p className="mt-1 text-sm leading-6 text-text-bright">{item.recovery}</p>
                      </div>
                    )}
                    <p className="mt-3 text-xs text-text-dimmed">
                      Checked {new Date(item.checkedAt).toLocaleTimeString()}
                      {item.latencyMs === null ? "" : ` · ${item.latencyMs} ms`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <Header2>Platform connections</Header2>
        <Paragraph variant="small" className="mt-1">
          Provider configuration is tracked separately from live infrastructure readiness.
        </Paragraph>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {connectionStatuses.map((status) => {
            const ready = status.status === "present" || status.status === "detected";
            const emailSetup = status.id === "general-email" || status.id === "alert-email";
            return (
              <div
                key={status.id}
                className="rounded-lg border border-grid-bright bg-background-bright p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-text-bright">{status.name}</p>
                    <p className="mt-1 text-sm leading-6 text-text-dimmed">{status.description}</p>
                    {emailSetup && (
                      <a className="mt-2 inline-block text-sm text-indigo-300 hover:text-indigo-200" href="/setup/email">
                        Configure email
                      </a>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-xs ${
                      ready
                        ? "border-green-500/30 bg-green-500/10 text-green-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {ready ? "Configured" : "Needs setup"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className={`rounded-lg border p-5 ${
          platformReady
            ? "border-indigo-500/30 bg-indigo-500/10"
            : "border-amber-500/30 bg-amber-500/10"
        }`}
      >
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
