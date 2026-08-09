import { json, type MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { KeyIcon, ShieldCheckIcon } from "lucide-react";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { LinkButton } from "~/components/primitives/Buttons";
import { DateTime } from "~/components/primitives/DateTime";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "~/components/primitives/Table";
import { Tabs } from "~/components/primitives/Tabs";
import { prisma } from "~/db.server";
import {
  requireFlowcordiaProjectContext,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { resolveFlowcordiaCredentialEnvironment } from "~/features/flowcordia/workflows/credentials/query.server";
import { useEnvironment } from "~/hooks/useEnvironment";
import { useOrganization } from "~/hooks/useOrganizations";
import { useProject } from "~/hooks/useProject";
import { dashboardLoader } from "~/services/routeBuilders/dashboardBuilder";
import {
  EnvironmentParamSchema,
  flowcordiaStudioV2Path,
  v3CredentialsPath,
  v3EnvironmentVariablesPath,
} from "~/utils/pathBuilder";

export const meta: MetaFunction = () => [{ title: "Credentials | Flowcordia" }];

const HTTP_PREFIX = "FLOWCORDIA_CREDENTIAL_";
const WEBHOOK_PREFIX = "FLOWCORDIA_WEBHOOK_HMAC_";

function credentialReference(key: string, prefix: string): string {
  return key.slice(prefix.length).toLowerCase().replaceAll("_", "-");
}

export const loader = dashboardLoader(
  {
    params: EnvironmentParamSchema,
    context: resolveFlowcordiaProjectContext,
  },
  async ({ context, params, ability }) => {
    const { projectId } = requireFlowcordiaProjectContext(context);
    const environment = await resolveFlowcordiaCredentialEnvironment({
      projectId,
      environmentSlug: params.envParam,
    });
    if (!environment) throw new Response("Environment not found", { status: 404 });

    const canRead = ability.can("read", { type: "envvars", envType: environment.type });
    const canWrite = ability.can("write", { type: "envvars", envType: environment.type });
    if (!canRead) return json({ credentials: [], canRead, canWrite });

    const variables = await prisma.environmentVariable.findMany({
      where: {
        projectId,
        OR: [{ key: { startsWith: HTTP_PREFIX } }, { key: { startsWith: WEBHOOK_PREFIX } }],
        values: { some: { environmentId: environment.id } },
      },
      select: {
        key: true,
        values: {
          where: { environmentId: environment.id },
          select: { isSecret: true, version: true, updatedAt: true },
          take: 1,
        },
      },
      orderBy: { key: "asc" },
    });

    return json({
      canRead,
      canWrite,
      credentials: variables.flatMap((variable) => {
        const value = variable.values[0];
        if (!value) return [];
        const webhook = variable.key.startsWith(WEBHOOK_PREFIX);
        const prefix = webhook ? WEBHOOK_PREFIX : HTTP_PREFIX;
        return [
          {
            key: variable.key,
            reference: credentialReference(variable.key, prefix),
            type: webhook ? "Webhook HMAC" : "HTTP headers",
            state: value.isSecret ? "Ready" : "Needs attention",
            version: value.version,
            updatedAt: value.updatedAt,
          },
        ];
      }),
    });
  }
);

export default function CredentialsPage() {
  const data = useLoaderData<typeof loader>();
  const organization = useOrganization();
  const project = useProject();
  const environment = useEnvironment();
  const variablesPath = v3EnvironmentVariablesPath(organization, project, environment);
  const credentialsPath = v3CredentialsPath(organization, project, environment);

  return (
    <PageContainer>
      <NavBar>
        <PageTitle title="Environment" />
        <PageAccessories>
          <LinkButton
            variant="secondary/small"
            to={flowcordiaStudioV2Path(organization, project, environment)}
          >
            Open Studio
          </LinkButton>
        </PageAccessories>
      </NavBar>
      <PageBody scrollable={false}>
        <div className="flex h-full min-h-0 flex-col">
          <Tabs
            tabs={[
              { label: "Variables", to: variablesPath },
              { label: "Credentials", to: credentialsPath },
            ]}
            layoutId="environment-settings-tabs"
            className="shrink-0 px-3 pt-2"
          />

          {!data.canRead ? (
            <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
              <div className="max-w-md">
                <ShieldCheckIcon className="mx-auto size-8 text-text-dimmed" />
                <h2 className="mt-3 text-sm font-medium text-text-bright">
                  Credentials are protected
                </h2>
                <p className="mt-1 text-xs leading-5 text-text-dimmed">
                  Your role cannot read credential metadata in this environment.
                </p>
              </div>
            </div>
          ) : data.credentials.length === 0 ? (
            <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
              <div className="max-w-md">
                <KeyIcon className="mx-auto size-8 text-text-dimmed" />
                <h2 className="mt-3 text-sm font-medium text-text-bright">No credentials yet</h2>
                <p className="mt-1 text-xs leading-5 text-text-dimmed">
                  Open an HTTP or webhook node in Studio to create a write-only credential binding.
                </p>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Reference</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Version</TableHeaderCell>
                    <TableHeaderCell>Updated</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.credentials.map((credential) => (
                    <TableRow key={credential.key}>
                      <TableCell>
                        <span className="font-mono text-xs text-text-bright">
                          {credential.reference}
                        </span>
                      </TableCell>
                      <TableCell>{credential.type}</TableCell>
                      <TableCell>
                        <span
                          className={
                            credential.state === "Ready" ? "text-green-400" : "text-amber-400"
                          }
                        >
                          {credential.state}
                        </span>
                      </TableCell>
                      <TableCell>{credential.version}</TableCell>
                      <TableCell>
                        <DateTime date={credential.updatedAt} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </PageBody>
    </PageContainer>
  );
}
