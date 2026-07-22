import { DialogClose } from "@radix-ui/react-dialog";
import { useFetcher, useRevalidator } from "@remix-run/react";
import { CheckCircle2Icon, LinkIcon, ShieldCheckIcon } from "lucide-react";
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
import type { FlowcordiaProductionWebhookBindingProjection } from "./binding-query.server";

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

export function WorkflowProductionWebhookPanel({
  workflowId,
  graph,
  production,
  bindings,
  commandPath,
  canActivate,
}: {
  workflowId: string;
  graph: WorkflowStudioGraph;
  production: FlowcordiaProductionProjection;
  bindings: FlowcordiaProductionWebhookBindingProjection[];
  commandPath: string;
  canActivate: boolean;
}) {
  const revalidator = useRevalidator();
  const fetcher = useFetcher<FlowcordiaWebhookActivationResponse>();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
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
  const ready =
    production.state === "READY" &&
    Boolean(production.proposal?.proposalId) &&
    Boolean(production.proposal?.mergeCommitSha) &&
    canActivate;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok) return;
    revalidator.revalidate();
  }, [fetcher.data, fetcher.state, revalidator]);

  const submit = () => {
    if (
      !ready ||
      !selectedNode ||
      !production.proposal ||
      confirmation !== FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION ||
      fetcher.state !== "idle"
    ) {
      return;
    }
    fetcher.submit(
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
          <h3 className="text-sm font-medium text-text-bright">Production webhook activation</h3>
          <p className="mt-1 text-xxs leading-4 text-text-dimmed">
            Activate a stable public identity only after the exact promoted commit, production
            worker, generated task, signed trigger policy, and write-only HMAC credential are all
            ready.
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
                <Button
                  data-testid={`flowcordia-activate-webhook-${node.id}`}
                  variant="secondary/small"
                  LeadingIcon={ShieldCheckIcon}
                  disabled={!ready || binding?.state === "REVOKED" || fetcher.state !== "idle"}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    setConfirmation("");
                  }}
                >
                  {binding?.state === "ACTIVE" ? "Activate new revision" : "Activate webhook"}
                </Button>
              </div>

              {binding?.activeRevision ? (
                <div className="mt-2 grid gap-2 text-xxs text-text-dimmed sm:grid-cols-2">
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
              isLoading={fetcher.state !== "idle"}
              disabled={
                !ready ||
                confirmation !== FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION ||
                fetcher.state !== "idle"
              }
              onClick={submit}
            >
              Activate exact binding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {fetcher.data && !fetcher.data.ok ? (
        <div className="mt-3 rounded border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {fetcher.data.message ?? "Webhook activation failed safely."}
        </div>
      ) : null}
      {fetcher.data?.ok && fetcher.data.endpoint ? (
        <div className="mt-3 rounded border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Endpoint {fetcher.data.endpoint.publicId} is bound to revision{" "}
          {fetcher.data.endpoint.revision}.
        </div>
      ) : null}
    </section>
  );
}
