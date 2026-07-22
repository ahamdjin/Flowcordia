import type { ProductionWebhookRevocationReason } from "@flowcordia/control-plane";
import { DialogClose } from "@radix-ui/react-dialog";
import { useFetcher, useRevalidator } from "@remix-run/react";
import { BanIcon, CheckCircle2Icon, LinkIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "~/components/primitives/Badge";
import { Button } from "~/components/primitives/Buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/primitives/Dialog";
import { cn } from "~/utils/cn";
import type { FlowcordiaProductionProjection } from "../production/presentation";
import type { WorkflowStudioGraph } from "../studio/presentation";
import {
  buildFlowcordiaWebhookActivationCommand,
  FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION,
  type FlowcordiaWebhookActivationResponse,
} from "./activation-command";
import type {
  FlowcordiaProductionWebhookBindingProjection,
  FlowcordiaWebhookDeliveryProjectionState,
} from "./binding-query.server";
import {
  buildFlowcordiaWebhookRevocationCommand,
  FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION,
  FLOWCORDIA_WEBHOOK_REVOCATION_REASONS,
  type FlowcordiaWebhookRevocationResponse,
} from "./revocation-command";

const reasonLabels: Record<ProductionWebhookRevocationReason, string> = {
  credential_compromise: "Credential compromise",
  unexpected_traffic: "Unexpected traffic",
  workflow_retired: "Workflow retired",
  manual_emergency_stop: "Manual emergency stop",
};

function stateTone(state: FlowcordiaProductionWebhookBindingProjection["state"]): string {
  switch (state) {
    case "ACTIVE":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "REVOKED":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "INACTIVE":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
  }
}

function deliveryTone(state: FlowcordiaWebhookDeliveryProjectionState): string {
  switch (state) {
    case "DELIVERED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "FAILED":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "PROCESSING":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
  }
}

export function WorkflowProductionWebhookPanel({
  workflowId,
  graph,
  production,
  bindings,
  commandPath,
  revocationCommandPath,
  canActivate,
  canRevoke,
}: {
  workflowId: string;
  graph: WorkflowStudioGraph;
  production: FlowcordiaProductionProjection;
  bindings: FlowcordiaProductionWebhookBindingProjection[];
  commandPath: string;
  revocationCommandPath: string;
  canActivate: boolean;
  canRevoke: boolean;
}) {
  const revalidator = useRevalidator();
  const activationFetcher = useFetcher<FlowcordiaWebhookActivationResponse>();
  const revocationFetcher = useFetcher<FlowcordiaWebhookRevocationResponse>();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [revocationNodeId, setRevocationNodeId] = useState<string | null>(null);
  const [revocationConfirmation, setRevocationConfirmation] = useState("");
  const [revocationReason, setRevocationReason] =
    useState<ProductionWebhookRevocationReason>("manual_emergency_stop");
  const webhookNodes = useMemo(
    () =>
      graph.nodes.filter(
        (node) => node.operation === "trigger.webhook" && node.ownership === "visual"
      ),
    [graph.nodes]
  );
  const bindingByNode = useMemo(
    () => new Map(bindings.map((binding) => [binding.nodeId, binding])),
    [bindings]
  );
  const selectedNode = webhookNodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedRevocationNode = webhookNodes.find((node) => node.id === revocationNodeId) ?? null;
  const selectedRevocationBinding = selectedRevocationNode
    ? (bindingByNode.get(selectedRevocationNode.id) ?? null)
    : null;
  const ready =
    production.state === "READY" &&
    Boolean(production.proposal?.proposalId) &&
    Boolean(production.proposal?.mergeCommitSha) &&
    canActivate;
  const readyToRevoke =
    canRevoke &&
    selectedRevocationBinding?.state === "ACTIVE" &&
    revocationFetcher.state === "idle";

  useEffect(() => {
    if (activationFetcher.state !== "idle" || !activationFetcher.data?.ok) return;
    revalidator.revalidate();
  }, [activationFetcher.data, activationFetcher.state, revalidator]);

  useEffect(() => {
    if (revocationFetcher.state !== "idle" || !revocationFetcher.data?.ok) return;
    revalidator.revalidate();
  }, [revocationFetcher.data, revocationFetcher.state, revalidator]);

  const submitActivation = () => {
    if (
      !ready ||
      !selectedNode ||
      !production.proposal ||
      confirmation !== FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION ||
      activationFetcher.state !== "idle"
    ) {
      return;
    }
    activationFetcher.submit(
      buildFlowcordiaWebhookActivationCommand({
        workflowId,
        nodeId: selectedNode.id,
        expectedProposalId: production.proposal.proposalId,
        expectedMergeCommitSha: production.proposal.mergeCommitSha,
      }),
      { method: "POST", action: commandPath, encType: "application/json" }
    );
    setSelectedNodeId(null);
    setConfirmation("");
  };

  const submitRevocation = () => {
    if (
      !readyToRevoke ||
      !selectedRevocationNode ||
      !selectedRevocationBinding ||
      revocationConfirmation !== FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION
    ) {
      return;
    }
    revocationFetcher.submit(
      buildFlowcordiaWebhookRevocationCommand({
        workflowId,
        nodeId: selectedRevocationNode.id,
        expectedPublicId: selectedRevocationBinding.publicId,
        reason: revocationReason,
      }),
      { method: "POST", action: revocationCommandPath, encType: "application/json" }
    );
    setRevocationNodeId(null);
    setRevocationConfirmation("");
    setRevocationReason("manual_emergency_stop");
  };

  if (webhookNodes.length === 0) return null;

  return (
    <section
      data-testid="flowcordia-production-webhooks"
      data-node-count={webhookNodes.length}
      className="border-b border-grid-bright bg-background-dimmed px-4 py-3"
    >
      <div className="flex items-start gap-2">
        <LinkIcon className="mt-0.5 size-4 text-indigo-300" />
        <div>
          <h3 className="text-sm font-medium text-text-bright">Production webhook endpoint</h3>
          <p className="mt-1 text-xxs leading-4 text-text-dimmed">
            Activate an immutable callable endpoint, review recent signed delivery outcomes, or
            permanently revoke a public identity during an incident.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {webhookNodes.map((node) => {
          const binding = bindingByNode.get(node.id) ?? null;
          return (
            <div
              key={node.id}
              data-testid={`flowcordia-production-webhook-${node.id}`}
              data-binding-state={binding?.state ?? "NOT_ACTIVATED"}
              data-endpoint-public-id={binding?.publicId ?? ""}
              data-revision={binding?.activeRevision?.revision ?? ""}
              data-public-url={binding?.activeRevision?.publicUrl ?? ""}
              className="rounded border border-grid-bright bg-background-bright px-3 py-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-text-bright">
                      {node.name}
                    </span>
                    {binding ? (
                      <Badge className={cn("border", stateTone(binding.state))}>
                        {binding.state}
                      </Badge>
                    ) : (
                      <Badge className="border border-grid-bright bg-background-dimmed text-text-dimmed">
                        NOT ACTIVATED
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 truncate font-mono text-xxs text-text-dimmed">{node.id}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {binding?.state !== "REVOKED" ? (
                    <Button
                      data-testid={`flowcordia-activate-webhook-${node.id}`}
                      variant="secondary/small"
                      LeadingIcon={ShieldCheckIcon}
                      disabled={!ready || activationFetcher.state !== "idle"}
                      onClick={() => {
                        setSelectedNodeId(node.id);
                        setConfirmation("");
                      }}
                    >
                      {binding?.state === "ACTIVE" ? "Activate new revision" : "Activate webhook"}
                    </Button>
                  ) : null}
                  {binding?.state === "ACTIVE" ? (
                    <Button
                      data-testid={`flowcordia-revoke-webhook-${node.id}`}
                      variant="danger/small"
                      LeadingIcon={BanIcon}
                      disabled={!canRevoke || revocationFetcher.state !== "idle"}
                      onClick={() => {
                        setRevocationNodeId(node.id);
                        setRevocationConfirmation("");
                        setRevocationReason("manual_emergency_stop");
                      }}
                    >
                      Revoke endpoint
                    </Button>
                  ) : null}
                </div>
              </div>

              {binding?.activeRevision ? (
                <div className="mt-2 grid gap-2 text-xxs text-text-dimmed sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    URL{" "}
                    <span className="break-all font-mono text-text-bright">
                      {binding.activeRevision.publicUrl}
                    </span>
                  </div>
                  <div>
                    Endpoint <span className="font-mono text-text-bright">{binding.publicId}</span>
                  </div>
                  <div>
                    Revision{" "}
                    <span className="font-mono text-text-bright">
                      {binding.activeRevision.revision}
                    </span>
                  </div>
                  <div>
                    Contract{" "}
                    <span className="font-mono text-text-bright">
                      {binding.activeRevision.method} {binding.activeRevision.path}
                    </span>
                  </div>
                  <div>
                    Worker{" "}
                    <span className="font-mono text-text-bright">
                      {binding.activeRevision.workerVersion}
                    </span>
                  </div>
                </div>
              ) : null}

              {binding?.revocation ? (
                <div className="mt-3 rounded border border-rose-500/25 bg-rose-500/10 px-2.5 py-2 text-xxs text-rose-200">
                  Permanently revoked at{" "}
                  <time dateTime={binding.revocation.revokedAt}>
                    {binding.revocation.revokedAt}
                  </time>
                  {" · "}
                  {reasonLabels[binding.revocation.reason]}
                </div>
              ) : null}

              {binding && binding.recentDeliveries.length > 0 ? (
                <div className="mt-3 border-t border-grid-bright pt-2">
                  <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                    Recent deliveries
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {binding.recentDeliveries.map((delivery) => (
                      <div
                        key={`${delivery.reference}:${delivery.receivedAt}`}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xxs text-text-dimmed"
                      >
                        <Badge className={cn("border", deliveryTone(delivery.state))}>
                          {delivery.state}
                        </Badge>
                        <span className="font-mono text-text-bright">{delivery.reference}</span>
                        <span>attempts {delivery.attempts}</span>
                        <time dateTime={delivery.receivedAt}>{delivery.receivedAt}</time>
                        {delivery.failureCode ? (
                          <span className="font-mono text-rose-200">{delivery.failureCode}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <Dialog
        open={Boolean(selectedNode)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedNodeId(null);
            setConfirmation("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate this exact production webhook?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Flowcordia will bind node <span className="font-mono">{selectedNode?.id ?? ""}</span> to
            the exact production deployment at merge commit{" "}
            <span className="font-mono">
              {production.proposal?.mergeCommitSha.slice(0, 8) ?? "unavailable"}
            </span>
            . Existing endpoint history will remain immutable.
          </DialogDescription>
          <label className="mt-4 block text-xs font-medium text-text-bright">
            Type <span className="font-mono">{FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION}</span>
            <input
              data-testid="flowcordia-webhook-activation-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              className="mt-1.5 h-9 w-full rounded border border-grid-bright bg-background-dimmed px-2.5 font-mono text-xs text-text-bright outline-none focus:border-indigo-400"
            />
          </label>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="secondary/small">Cancel</Button>
            </DialogClose>
            <Button
              data-testid="flowcordia-webhook-activation-confirm"
              variant="primary/small"
              LeadingIcon={CheckCircle2Icon}
              isLoading={activationFetcher.state !== "idle"}
              disabled={
                !ready ||
                confirmation !== FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION ||
                activationFetcher.state !== "idle"
              }
              onClick={submitActivation}
            >
              Activate exact binding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedRevocationNode)}
        onOpenChange={(open) => {
          if (!open) {
            setRevocationNodeId(null);
            setRevocationConfirmation("");
            setRevocationReason("manual_emergency_stop");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently revoke this public endpoint?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Requests to endpoint{" "}
            <span className="font-mono">{selectedRevocationBinding?.publicId ?? ""}</span> will stop
            immediately. This public identity cannot be reactivated; immutable revision history and
            delivery evidence remain available.
          </DialogDescription>
          <label className="mt-4 block text-xs font-medium text-text-bright">
            Reason
            <select
              data-testid="flowcordia-webhook-revocation-reason"
              value={revocationReason}
              onChange={(event) =>
                setRevocationReason(event.target.value as ProductionWebhookRevocationReason)
              }
              className="mt-1.5 h-9 w-full rounded border border-grid-bright bg-background-dimmed px-2.5 text-xs text-text-bright outline-none focus:border-rose-400"
            >
              {FLOWCORDIA_WEBHOOK_REVOCATION_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reasonLabels[reason]}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block text-xs font-medium text-text-bright">
            Type <span className="font-mono">{FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION}</span>
            <input
              data-testid="flowcordia-webhook-revocation-confirmation"
              value={revocationConfirmation}
              onChange={(event) => setRevocationConfirmation(event.target.value)}
              autoComplete="off"
              className="mt-1.5 h-9 w-full rounded border border-grid-bright bg-background-dimmed px-2.5 font-mono text-xs text-text-bright outline-none focus:border-rose-400"
            />
          </label>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="secondary/small">Cancel</Button>
            </DialogClose>
            <Button
              data-testid="flowcordia-webhook-revocation-confirm"
              variant="danger/small"
              LeadingIcon={BanIcon}
              isLoading={revocationFetcher.state !== "idle"}
              disabled={
                !readyToRevoke ||
                revocationConfirmation !== FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION
              }
              onClick={submitRevocation}
            >
              Permanently revoke endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activationFetcher.data && !activationFetcher.data.ok ? (
        <div className="mt-3 rounded border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {activationFetcher.data.message ?? "Webhook activation failed safely."}
        </div>
      ) : null}
      {activationFetcher.data?.ok && activationFetcher.data.endpoint ? (
        <div className="mt-3 rounded border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Endpoint {activationFetcher.data.endpoint.publicId} is bound to revision{" "}
          {activationFetcher.data.endpoint.revision}.
        </div>
      ) : null}
      {revocationFetcher.data && !revocationFetcher.data.ok ? (
        <div className="mt-3 rounded border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {revocationFetcher.data.message ?? "Webhook revocation failed safely."}
        </div>
      ) : null}
      {revocationFetcher.data?.ok && revocationFetcher.data.endpoint ? (
        <div className="mt-3 rounded border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          Endpoint {revocationFetcher.data.endpoint.publicId} is permanently revoked.
        </div>
      ) : null}
    </section>
  );
}
