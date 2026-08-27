import { json, type MetaFunction } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { KeyIcon, PlusIcon, RotateCcwIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { DateTime } from "~/components/primitives/DateTime";
import { Dialog, DialogContent, DialogHeader } from "~/components/primitives/Dialog";
import { Fieldset } from "~/components/primitives/Fieldset";
import { FormButtons } from "~/components/primitives/FormButtons";
import { Hint } from "~/components/primitives/Hint";
import { Input } from "~/components/primitives/Input";
import { InputGroup } from "~/components/primitives/InputGroup";
import { Label } from "~/components/primitives/Label";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import { Select, SelectItem } from "~/components/primitives/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "~/components/primitives/Table";
import { Tabs } from "~/components/primitives/Tabs";
import { useToast } from "~/components/primitives/Toast";
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
import { queryStudioV2ActivepiecesConnections } from "~/features/flowcordia/workflows/studio-v2/activepieces-connections.server";
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

function integrationLabel(pieceName: string): string {
  return pieceName
    .replace(/^@activepieces\/piece-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const CredentialForm = z
  .object({
    reference: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{0,63}$/, "Use lowercase letters, numbers, and hyphens."),
    credentialType: z.enum(["http_headers", "webhook_hmac"]),
    headerName: z.string().trim().max(128).optional(),
    secret: z.string().min(1).max(8_192),
  })
  .superRefine((value, context) => {
    if (value.credentialType === "http_headers" && !value.headerName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["headerName"],
        message: "A header name is required.",
      });
    }
  });

type CredentialActionData =
  | { ok: true; message: string; reference: string }
  | { ok: false; message: string };

export const action = dashboardAction(
  {
    params: EnvironmentParamSchema,
    context: resolveFlowcordiaProjectContext,
  },
  async ({ request, context, params, user, ability }) => {
    if (request.method.toUpperCase() !== "POST") {
      return json<CredentialActionData>(
        { ok: false, message: "Method not allowed." },
        { status: 405 }
      );
    }

    const { projectId } = requireFlowcordiaProjectContext(context);
    const environment = await resolveFlowcordiaCredentialEnvironment({
      projectId,
      environmentSlug: params.envParam,
    });
    if (!environment) throw new Response("Environment not found", { status: 404 });
    if (!ability.can("write", { type: "envvars", envType: environment.type })) {
      return json<CredentialActionData>(
        { ok: false, message: "You cannot manage credentials in this environment." },
        { status: 403 }
      );
    }

    const parsed = CredentialForm.safeParse(Object.fromEntries(await request.formData()));
    if (!parsed.success) {
      return json<CredentialActionData>(
        {
          ok: false,
          message: parsed.error.issues[0]?.message ?? "Check the credential and try again.",
        },
        { status: 400 }
      );
    }

    const normalized =
      parsed.data.credentialType === "webhook_hmac"
        ? normalizeFlowcordiaWebhookSecret(parsed.data.secret)
        : normalizeFlowcordiaCredentialHeaders([
            { name: parsed.data.headerName!, value: parsed.data.secret },
          ]);
    if (!normalized.success) {
      return json<CredentialActionData>(
        { ok: false, message: normalized.message },
        { status: 400 }
      );
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
      return json<CredentialActionData>(
        { ok: false, message: "The credential could not be stored. Try again." },
        { status: 500 }
      );
    }

    return json<CredentialActionData>({
      ok: true,
      message: "Credential saved. Its value will not be shown again.",
      reference: parsed.data.reference,
    });
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

    const [variables, integrationConnections] = await Promise.all([
      prisma.environmentVariable.findMany({
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
      }),
      queryStudioV2ActivepiecesConnections({ projectId, environmentId: environment.id }),
    ]);

    return json({
      canRead,
      canWrite,
      credentials: [
        ...variables.flatMap((variable) => {
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
              updatedAt: value.updatedAt,
              managedInStudio: false as const,
            },
          ];
        }),
        ...integrationConnections.map((connection) => ({
          key: `activepieces:${connection.id}`,
          reference: connection.displayName,
          type: integrationLabel(connection.pieceName),
          state: connection.status === "ACTIVE" ? "Ready" : "Needs attention",
          updatedAt: new Date(connection.updated),
          managedInStudio: true as const,
        })),
      ],
    });
  }
);

export default function CredentialsPage() {
  const data = useLoaderData<typeof loader>();
  const credentialFetcher = useFetcher<typeof action>();
  const toast = useToast();
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [credentialType, setCredentialType] = useState<"http_headers" | "webhook_hmac">(
    "http_headers"
  );
  const [editingReference, setEditingReference] = useState<string>();
  const submissionStarted = useRef(false);
  const organization = useOrganization();
  const project = useProject();
  const environment = useEnvironment();
  const variablesPath = v3EnvironmentVariablesPath(organization, project, environment);
  const credentialsPath = v3CredentialsPath(organization, project, environment);

  useEffect(() => {
    if (credentialFetcher.state === "submitting") submissionStarted.current = true;
    if (
      credentialFetcher.state === "idle" &&
      submissionStarted.current &&
      credentialFetcher.data?.ok
    ) {
      submissionStarted.current = false;
      toast.success(credentialFetcher.data.message);
      setCredentialDialogOpen(false);
    }
  }, [credentialFetcher.data, credentialFetcher.state, toast]);

  const openCredentialDialog = (credential?: (typeof data.credentials)[number]) => {
    submissionStarted.current = false;
    setEditingReference(credential?.reference);
    setCredentialType(credential?.type === "Webhook HMAC" ? "webhook_hmac" : "http_headers");
    setCredentialDialogOpen(true);
  };

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
              onClick={() => openCredentialDialog()}
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
                  Add an API header or webhook signing secret for this environment.
                </p>
                {data.canWrite ? (
                  <Button
                    type="button"
                    variant="secondary/small"
                    LeadingIcon={PlusIcon}
                    className="mt-4"
                    onClick={() => openCredentialDialog()}
                  >
                    Add credential
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Updated</TableHeaderCell>
                    <TableHeaderCell hiddenLabel>Actions</TableHeaderCell>
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
                      <TableCell>
                        <DateTime date={credential.updatedAt} />
                      </TableCell>
                      <TableCell>
                        {data.canWrite && !credential.managedInStudio ? (
                          <Button
                            type="button"
                            variant="minimal/small"
                            LeadingIcon={RotateCcwIcon}
                            tooltip={`Replace ${credential.reference} without revealing its current value`}
                            onClick={() => openCredentialDialog(credential)}
                          >
                            Rotate
                          </Button>
                        ) : credential.managedInStudio ? (
                          <LinkButton
                            variant="minimal/small"
                            to={flowcordiaStudioV2Path(organization, project, environment)}
                          >
                            Open Studio
                          </LinkButton>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </PageBody>

      <Dialog open={credentialDialogOpen} onOpenChange={setCredentialDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>{editingReference ? "Rotate credential" : "Add credential"}</DialogHeader>
          <credentialFetcher.Form method="post" className="pt-3">
            <input type="hidden" name="credentialType" value={credentialType} />
            <Fieldset>
              <InputGroup fullWidth>
                <Label htmlFor="credential-reference">Reference</Label>
                <Input
                  id="credential-reference"
                  name="reference"
                  defaultValue={editingReference}
                  readOnly={Boolean(editingReference)}
                  placeholder="openai-api"
                  autoComplete="off"
                  required
                />
                <Hint>Use this stable name when selecting the credential in Studio.</Hint>
              </InputGroup>

              <InputGroup fullWidth>
                <Label>Type</Label>
                <Select<string, { value: "http_headers" | "webhook_hmac"; label: string }>
                  value={credentialType}
                  setValue={(value) =>
                    setCredentialType(value === "webhook_hmac" ? "webhook_hmac" : "http_headers")
                  }
                  items={[
                    { value: "http_headers", label: "API key or HTTP header" },
                    { value: "webhook_hmac", label: "Webhook signing secret" },
                  ]}
                  text={(value) =>
                    value === "webhook_hmac" ? "Webhook signing secret" : "API key or HTTP header"
                  }
                  variant="tertiary/small"
                  dropdownIcon
                  disabled={Boolean(editingReference)}
                >
                  {(items) =>
                    items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))
                  }
                </Select>
              </InputGroup>

              {credentialType === "http_headers" ? (
                <InputGroup fullWidth>
                  <Label htmlFor="credential-header-name">Header name</Label>
                  <Input
                    id="credential-header-name"
                    name="headerName"
                    defaultValue="authorization"
                    placeholder="authorization"
                    autoComplete="off"
                    required
                  />
                </InputGroup>
              ) : null}

              <InputGroup fullWidth>
                <Label htmlFor="credential-secret">
                  {editingReference ? "New secret value" : "Secret value"}
                </Label>
                <Input
                  id="credential-secret"
                  name="secret"
                  type="password"
                  placeholder={credentialType === "http_headers" ? "Bearer ..." : undefined}
                  autoComplete="new-password"
                  required
                />
                <Hint>
                  {credentialType === "webhook_hmac"
                    ? "Use a signing secret of at least 32 bytes."
                    : "The complete header value is encrypted at rest and is never displayed."}
                </Hint>
              </InputGroup>

              {submissionStarted.current && credentialFetcher.data && !credentialFetcher.data.ok ? (
                <p className="text-xs text-rose-500" role="alert">
                  {credentialFetcher.data.message}
                </p>
              ) : null}

              <FormButtons
                confirmButton={
                  <Button
                    type="submit"
                    variant="primary/small"
                    disabled={credentialFetcher.state !== "idle"}
                  >
                    {credentialFetcher.state === "submitting"
                      ? "Saving..."
                      : editingReference
                        ? "Rotate credential"
                        : "Save credential"}
                  </Button>
                }
                cancelButton={
                  <Button
                    type="button"
                    variant="tertiary/small"
                    onClick={() => setCredentialDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                }
              />
            </Fieldset>
          </credentialFetcher.Form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
