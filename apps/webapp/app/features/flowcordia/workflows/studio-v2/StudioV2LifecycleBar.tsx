import { useFetcher, useRevalidator } from "@remix-run/react";
import {
  CheckCircle2Icon,
  DownloadIcon,
  FlaskConicalIcon,
  GitPullRequestIcon,
  HistoryIcon,
  RefreshCwIcon,
  RocketIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/primitives/Buttons";
import type { StudioV2ReleaseProjection } from "./release-contract";
import type { StudioV2RepositoryProjection } from "./repository-contract";
import type { StudioV2ClientWorkspaceProjection } from "./client-contract";
import type { StudioV2WorkspaceActionData, StudioV2WorkspaceCommand } from "./workspace-http";

type StudioV2LifecycleCommand = Extract<
  StudioV2WorkspaceCommand,
  { intent: "test" | "test_status" | "cancel_test" | "stage" | "deploy" | "rollback" }
>;

type StudioV2RepositoryCommand = Extract<
  StudioV2WorkspaceCommand,
  { intent: "repository_pull" | "repository_push" | "repository_sync" }
>;

export function StudioV2LifecycleBar({
  workspace,
  initialRelease,
  initialCurrentRelease,
  releaseHistory,
  initialRepository,
  canWrite,
  editorSaving = false,
  onWorkspaceChange,
}: {
  workspace: StudioV2ClientWorkspaceProjection;
  initialRelease: StudioV2ReleaseProjection | null;
  initialCurrentRelease: StudioV2ReleaseProjection | null;
  releaseHistory: StudioV2ReleaseProjection[];
  initialRepository: StudioV2RepositoryProjection | null;
  canWrite: boolean;
  editorSaving?: boolean;
  onWorkspaceChange(workspace: StudioV2ClientWorkspaceProjection): void;
}) {
  const fetcher = useFetcher<StudioV2WorkspaceActionData>();
  const revalidator = useRevalidator();
  const [release, setRelease] = useState(initialRelease);
  const [currentDeploymentRelease, setCurrentDeploymentRelease] = useState(initialCurrentRelease);
  const [repository, setRepository] = useState(initialRepository);
  const [message, setMessage] = useState<string>();
  const [testRunId, setTestRunId] = useState<string>();
  const [testWarming, setTestWarming] = useState(false);
  const warmupAttempts = useRef(0);
  const busy = fetcher.state !== "idle";
  const tested =
    workspace.testedVersion === workspace.version && workspace.lastTestSucceeded === true;
  const currentRelease = release?.workspaceVersion === workspace.version ? release : null;
  const rollbackTarget = releaseHistory.find(
    (candidate) =>
      candidate.status === "DEPLOYED" &&
      candidate.publicId !== currentDeploymentRelease?.publicId &&
      BigInt(candidate.workspaceVersion) <
        BigInt(currentDeploymentRelease?.workspaceVersion ?? "0"),
  );

  useEffect(() => setRelease(initialRelease), [initialRelease]);
  useEffect(() => setCurrentDeploymentRelease(initialCurrentRelease), [initialCurrentRelease]);
  useEffect(() => setRepository(initialRepository), [initialRepository]);
  useEffect(() => {
    setRepository((current) =>
      current
        ? {
            ...current,
            status:
              workspace.documentSha256 === current.canonicalSha256 ? "SYNCHRONIZED" : "MODIFIED",
          }
        : current,
    );
  }, [workspace.documentSha256]);

  const submit = useCallback(
    (command: StudioV2LifecycleCommand | StudioV2RepositoryCommand) =>
      fetcher.submit(command, { method: "post", encType: "application/json" }),
    [fetcher],
  );

  useEffect(() => {
    if (release?.status !== "DEPLOYING") return;
    const interval = window.setInterval(() => revalidator.revalidate(), 2_000);
    return () => window.clearInterval(interval);
  }, [release?.status, revalidator]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (!data.ok) {
      setTestRunId(undefined);
      setTestWarming(false);
      setMessage(data.message);
      return;
    }
    if (data.intent === "cancel_test") {
      setTestRunId(undefined);
      setTestWarming(false);
      setMessage(`Cancellation requested for ${data.runId}.`);
      return;
    }
    if (data.intent === "test") {
      if (data.test.status === "warming") {
        setTestWarming(true);
        setMessage(data.test.message);
        return;
      }
      if (data.test.status === "running") {
        setTestWarming(false);
        setTestRunId(data.test.runId);
        setMessage(data.test.message);
        return;
      }
      setTestRunId(undefined);
      setTestWarming(false);
      if (data.workspace) onWorkspaceChange(data.workspace);
      setMessage(
        data.test.success
          ? `Run ${data.test.runId} passed across ${data.test.execution.traces.length} nodes.`
          : (data.test.execution.traces.find(
              (trace) => trace.status === "FAILED" || trace.status === "CANCELLED",
            )?.message ?? `Run ${data.test.runId} failed.`),
      );
      return;
    }
    if (data.intent === "stage" || data.intent === "deploy" || data.intent === "rollback") {
      if (data.intent !== "rollback") {
        setRelease(data.release);
      }
      if (data.intent === "rollback" || data.release.status === "DEPLOYED") {
        setCurrentDeploymentRelease(data.release);
      }
      setMessage(
        data.intent === "stage"
          ? `Version ${data.release.workspaceVersion} staged.`
          : data.intent === "rollback"
            ? `Rolled back to version ${data.release.workspaceVersion}.`
            : data.release.status === "DEPLOYED"
              ? `Version ${data.release.workspaceVersion} deployed.`
              : "Deployment started.",
      );
      return;
    }
    if (data.intent === "repository_pull") {
      setRepository(data.repository);
      onWorkspaceChange(data.workspace);
      setMessage(`Pulled ${data.repository.workflowPath} from ${data.repository.branch}.`);
      return;
    }
    if (data.intent === "repository_push") {
      setMessage(
        data.proposal.pullRequestNumber === null
          ? `Proposal ${data.proposal.proposalId} is being created.`
          : `Pull request #${data.proposal.pullRequestNumber} created.`,
      );
      return;
    }
    if (data.intent === "repository_sync") {
      setMessage(
        `Synchronized ${data.validCount} workflow${data.validCount === 1 ? "" : "s"} at ${data.commitSha.slice(0, 7)}.`,
      );
      revalidator.revalidate();
    }
  }, [fetcher.data, onWorkspaceChange, revalidator]);

  useEffect(() => {
    if (!testWarming || busy) return;
    if (warmupAttempts.current >= 80) {
      setTestWarming(false);
      setMessage("The exact workflow test worker did not become ready in time.");
      return;
    }
    const timeout = window.setTimeout(() => {
      warmupAttempts.current += 1;
      submit({
        intent: "test",
        expectedVersion: workspace.version,
        input: null,
        retryFailedDeployment: false,
      });
    }, 1_500);
    return () => window.clearTimeout(timeout);
  }, [busy, submit, testWarming, workspace.version]);

  useEffect(() => {
    if (!testRunId || busy) return;
    const timeout = window.setTimeout(
      () => submit({ intent: "test_status", expectedVersion: workspace.version, runId: testRunId }),
      1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [busy, submit, testRunId, workspace.version]);

  const testing = testWarming || Boolean(testRunId);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden max-w-72 truncate text-xxs text-text-dimmed xl:block" role="status">
        {message ??
          (currentRelease
            ? `Version ${currentRelease.workspaceVersion} ${currentRelease.status.toLowerCase()}`
            : tested
              ? `Version ${workspace.version} tested`
              : `Version ${workspace.version} not tested`)}
      </span>
      {repository ? (
        <>
          <Button
            type="button"
            variant="minimal/small"
            LeadingIcon={RefreshCwIcon}
            tooltip={`Synchronize ${repository.repository}:${repository.branch}`}
            disabled={!canWrite || busy || testing || editorSaving}
            onClick={() => submit({ intent: "repository_sync" })}
          >
            Sync
          </Button>
          <Button
            type="button"
            variant="minimal/small"
            LeadingIcon={DownloadIcon}
            tooltip={`Replace this workspace with ${repository.workflowPath}`}
            disabled={!canWrite || busy || testing || editorSaving}
            onClick={() =>
              submit({ intent: "repository_pull", expectedVersion: workspace.version })
            }
          >
            Pull
          </Button>
          <Button
            type="button"
            variant="minimal/small"
            LeadingIcon={GitPullRequestIcon}
            tooltip="Push workspace changes to a governed GitHub pull request"
            disabled={
              !canWrite || busy || testing || editorSaving || repository.status === "SYNCHRONIZED"
            }
            onClick={() =>
              submit({ intent: "repository_push", expectedVersion: workspace.version })
            }
          >
            Push PR
          </Button>
          <div className="h-4 w-px bg-grid-bright" />
        </>
      ) : null}
      {testRunId ? (
        <Button
          type="button"
          variant="secondary/small"
          LeadingIcon={XCircleIcon}
          disabled={!canWrite || busy}
          onClick={() =>
            submit({ intent: "cancel_test", expectedVersion: workspace.version, runId: testRunId })
          }
        >
          Cancel
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary/small"
          LeadingIcon={FlaskConicalIcon}
          disabled={!canWrite || busy || editorSaving || testWarming}
          onClick={() => {
            warmupAttempts.current = 0;
            submit({
              intent: "test",
              expectedVersion: workspace.version,
              input: null,
              retryFailedDeployment: true,
            });
          }}
        >
          {testWarming ? "Preparing" : "Test"}
        </Button>
      )}
      <Button
        type="button"
        variant="secondary/small"
        LeadingIcon={CheckCircle2Icon}
        disabled={
          !canWrite || busy || testing || editorSaving || !tested || Boolean(currentRelease)
        }
        onClick={() => submit({ intent: "stage", expectedVersion: workspace.version })}
      >
        Stage
      </Button>
      <Button
        type="button"
        variant="primary/small"
        LeadingIcon={RocketIcon}
        disabled={
          !canWrite ||
          busy ||
          testing ||
          editorSaving ||
          !currentRelease ||
          currentRelease.status === "DEPLOYING" ||
          currentRelease.status === "DEPLOYED"
        }
        onClick={() =>
          currentRelease && submit({ intent: "deploy", releasePublicId: currentRelease.publicId })
        }
      >
        Deploy
      </Button>
      <Button
        type="button"
        variant="minimal/small"
        LeadingIcon={HistoryIcon}
        tooltip={
          rollbackTarget ? `Roll back to version ${rollbackTarget.workspaceVersion}` : undefined
        }
        disabled={!canWrite || busy || testing || editorSaving || !rollbackTarget}
        onClick={() =>
          rollbackTarget && submit({ intent: "rollback", releasePublicId: rollbackTarget.publicId })
        }
      >
        Rollback
      </Button>
    </div>
  );
}
