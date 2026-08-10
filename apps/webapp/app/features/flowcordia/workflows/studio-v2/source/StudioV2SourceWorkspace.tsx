import { lazy, Suspense } from "react";
import { ClientOnly } from "remix-utils/client-only";
import { Paragraph } from "~/components/primitives/Paragraph";
import type {
  WorkflowSourceLog,
  WorkflowSourceProblem,
  WorkflowSourceTestStatus,
  WorkflowSourceWorkspace,
} from "./workspace-model";

const StudioV2SourceWorkspaceClient = lazy(async () => {
  const module = await import("./StudioV2SourceWorkspace.client");
  return { default: module.StudioV2SourceWorkspaceClient };
});

/**
 * Flowcordia-facing Source workspace boundary.
 *
 * Sandpack is deliberately isolated in the client adapter. Callers only deal
 * in Flowcordia workspace values, leaving persistence, Trigger.dev testing,
 * streamed output/logs, AI patches, diff review, and node-to-source navigation
 * free to evolve without leaking Sandpack types into Studio.
 */
export type StudioV2SourceWorkspaceProps = {
  workspace: WorkflowSourceWorkspace;
  workflowDocument: unknown;
  readOnly?: boolean;
  dirty?: boolean;
  testInput?: string;
  onWorkspaceChange?(workspace: WorkflowSourceWorkspace): void;
  onTestInputChange?(value: string): void;
  onExitSource?(): void;
  onExitStudio?(): void;
  onSave?(): void | Promise<void>;
  saving?: boolean;
  onTest?(): void | Promise<void>;
  onCancelTest?(): void | Promise<void>;
  testStatus?: WorkflowSourceTestStatus;
  output?: unknown;
  logs?: readonly WorkflowSourceLog[];
  problems?: readonly WorkflowSourceProblem[];
  conflict?: {
    message: string;
    onReloadLatest(): void;
    onKeepLocalDraft(): void;
  };
};

function SourceWorkspaceFallback() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background-dimmed p-6">
      <Paragraph variant="extra-small/dimmed">Loading source editor...</Paragraph>
    </div>
  );
}

export function StudioV2SourceWorkspace(props: StudioV2SourceWorkspaceProps) {
  return (
    <ClientOnly fallback={<SourceWorkspaceFallback />}>
      {() => (
        <Suspense fallback={<SourceWorkspaceFallback />}>
          <StudioV2SourceWorkspaceClient {...props} />
        </Suspense>
      )}
    </ClientOnly>
  );
}
