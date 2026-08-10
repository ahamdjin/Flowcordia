import { json, type MetaFunction } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { KeyIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { DateTime } from "~/components/primitives/DateTime";
import { Input } from "~/components/primitives/Input";
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
import {
  credentialEnvironmentName,
  normalizeFlowcordiaCredentialHeaders,
  normalizeFlowcordiaWebhookSecret,
} from "~/features/flowcordia/workflows/credentials/contract";
import { useEnvironment } from "~/hooks/useEnvironment";
import { useOrganization } from "~/hooks/useOrganizations";
import { useProject } from "~/hooks/useProject";
import { dashboardAction, dashboardLoader } from "~/services/routeBuilders/dashboardBuilder";
import { EnvironmentVariablesRepository } from "~/v3/environmentVariables/environmentVariablesRepository.server";
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

const CredentialForm = z.object({
  reference: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/),
  credentialType: z.enum(["http_headers", "webhook_hmac"]),
  headerName: z.string().trim().max(128).optional(),
  secret: z.string().min(1).max(8_192),
});

type ActionData = { ok: boolean; message: string };

export const action = dashboardAction(
  {
    params: EnvironmentParamSchema,
    context: resolveFlowcordiaProjectContext,
  },
  async ({ request, context, params, user, ability }) => {
    if (request.method.toUpperCase() !== "POST") {
      return json<ActionData>({ ok: false, message: "Method not allowed." }, { status: 405 });
    }
    const { projectId } = requireFlowcordiaProjectContext(context);
    const environment = await resolveFlowcordiaCredentialEnvironment({
      projectId,
      environmentSlug: params.envParam,
    });
    if (!environment) throw new Response("Environment not found", { status: 404 });
    if (!ability.can("write", { type: "envvars", envType: environment.type })) {
      return json<ActionData>(
        { ok: false, message: "You cannot manage credentials here." },
        { status: 403 }
      );
    }

    const parsed = CredentialForm.safeParse(Object.fromEntries(await request.formData()));
    if (!parsed.success) {
      return json<ActionData>(
        { ok: false, message: "Check the credential name and secret, then try again." },
        { status: 400 }
      );
    }
    const normalized =
      parsed.data.credentialType === "webhook_hmac"
        ? normalizeFlowcordiaWebhookSecret(parsed.data.secret)
        : normalizeFlowcordiaCredentialHeaders([
            { name: parsed.data.headerName || "authorization", value: parsed.data.secret },
          ]);
    if (!normalized.success) {
      return json<ActionData>({ ok: false, message: normalized.message }, { status: 400 });
    }

    const repository = new EnvironmentVariablesRepository();
    const result = await repository.create(projectId, {
      override: true,
      environmentIds: [environment.id],
      isSecret: true,
      variables: [
        {
          key: credentialEnvironmentName(parsed.data.reference, parsed.data.credentialType),
          value: normalized.serialized,
        },
      ],
      lastUpdatedBy: { type: "user", userId: user.id },
    });
    if (!result.success) {
      return json<ActionData>(
        { ok: false, message: "Credential could not be stored. Try again." },
        { status: 500 }
      );
    }
    return json<ActionData>({ ok: true, message: "Credential saved securely." });
  }
);

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
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const [creating, setCreating] = useState(false);
  const [credentialType, setCredentialType] = useState("http_headers");
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
          {data.canWrite ? (
            <Button
              type="button"
              variant="primary/small"
              LeadingIcon={PlusIcon}
              onClick={() => setCreating((value) => !value)}
            >
              Add credential
            </Button>
          ) : null}
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

          {creating && data.canWrite ? (
            <Form
              method="post"
              className="mx-4 mt-4 grid max-w-3xl grid-cols-1 gap-3 border-b border-grid-dimmed pb-5 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <h2 className="text-sm font-medium text-text-bright">New credential</h2>
                <p className="mt-1 text-xs text-text-dimmed">
                  The secret is encrypted and never displayed again.
                </p>
              </div>
              <label className="space-y-1 text-xs text-text-dimmed">
                Reference
                <Input name="reference" placeholder="openai-api" required />
              </label>
              <label className="space-y-1 text-xs text-text-dimmed">
                Type
                <select
                  name="credentialType"
                  value={credentialType}
                  onChange={(event) => setCredentialType(event.target.value)}
                  className="h-8 w-full rounded border border-grid-bright bg-background px-2 text-sm text-text-bright focus-custom"
                >
                  <option value="http_headers">HTTP header / API key</option>
                  <option value="webhook_hmac">Webhook signing secret</option>
                </select>
              </label>
              {credentialType === "http_headers" ? (
                <label className="space-y-1 text-xs text-text-dimmed">
                  Header name
                  <Input name="headerName" defaultValue="authorization" required />
                </label>
              ) : null}
              <label className="space-y-1 text-xs text-text-dimmed">
                Secret value
                <Input name="secret" type="password" autoComplete="new-password" required />
              </label>
              <div className="flex items-center gap-2 text-xs text-text-dimmed sm:col-span-2">
                <input type="checkbox" checked disabled readOnly /> Stored as secret
              </div>
              {actionData ? (
                <p
                  className={`text-xs sm:col-span-2 ${actionData.ok ? "text-green-400" : "text-rose-500"}`}
                  role="status"
                >
                  {actionData.message}
                </p>
              ) : null}
              <div className="flex gap-2 sm:col-span-2">
                <Button
                  type="submit"
                  variant="primary/small"
                  disabled={navigation.state !== "idle"}
                >
                  {navigation.state === "submitting" ? "Saving..." : "Save credential"}
                </Button>
                <Button type="button" variant="minimal/small" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </Form>
          ) : null}

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
                  Add an API key, HTTP header, or webhook signing secret for this environment.
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
