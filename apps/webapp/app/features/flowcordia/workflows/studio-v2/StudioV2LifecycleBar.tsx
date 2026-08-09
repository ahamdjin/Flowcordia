import { useFetcher, useRevalidator } from "@remix-run/react";
import { CheckCircle2Icon, FlaskConicalIcon, HistoryIcon, RocketIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/primitives/Buttons";
import type { StudioV2ReleaseProjection } from "./release-contract";
import type { StudioV2ClientWorkspaceProjection } from "./client-contract";
import type { StudioV2WorkspaceActionData, StudioV2WorkspaceCommand } from "./workspace-http";

type StudioV2LifecycleCommand = Extract<
  StudioV2WorkspaceCommand,
  { intent: "test" | "stage" | "deploy" | "rollback" }
>;

export function StudioV2LifecycleBar({
  workspace,
  initialRelease,
  initialCurrentRelease,
  releaseHistory,
  canWrite,
  editorSaving = false,
  onWorkspaceChange,
}: {
  workspace: StudioV2ClientWorkspaceProjection;
  initialRelease: StudioV2ReleaseProjection | null;
  initialCurrentRelease: StudioV2ReleaseProjection | null;
  releaseHistory: StudioV2ReleaseProjection[];
  canWrite: boolean;
  editorSaving?: boolean;
  onWorkspaceChange(workspace: StudioV2ClientWorkspaceProjection): void;
}) {
  const fetcher = useFetcher<StudioV2WorkspaceActionData>();
  const revalidator = useRevalidator();
  const [release, setRelease] = useState(initialRelease);
  const [currentDeploymentRelease, setCurrentDeploymentRelease] = useState(initialCurrentRelease);
  const [message, setMessage] = useState<string>();
  const busy = fetcher.state !== "idle";
  const tested =
    workspace.testedVersion === workspace.version && workspace.lastTestSucceeded === true;
  const currentRelease = release?.workspaceVersion === workspace.version ? release : null;
  const rollbackTarget = releaseHistory.find(
    (candidate) =>
      candidate.status === "DEPLOYED" &&
      candidate.publicId !== currentDeploymentRelease?.publicId &&
      BigInt(candidate.workspaceVersion) < BigInt(currentDeploymentRelease?.workspaceVersion ?? "0")
  );

  useEffect(() => setRelease(initialRelease), [initialRelease]);
  useEffect(() => setCurrentDeploymentRelease(initialCurrentRelease), [initialCurrentRelease]);

  useEffect(() => {
    if (release?.status !== "DEPLOYING") return;
    const interval = window.setInterval(() => revalidator.revalidate(), 2_000);
    return () => window.clearInterval(interval);
  }, [release?.status, revalidator]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (!data.ok) {
      setMessage(data.message);
      return;
    }
    if (data.intent === "test") {
      onWorkspaceChange(data.workspace);
      setMessage(
        data.test.success
          ? `Test passed across ${data.test.execution?.traces.length ?? 0} nodes.`
          : (data.test.execution?.traces.find((trace) => trace.status === "FAILED")?.message ??
              data.test.issues[0]?.message ??
              "Workflow test failed.")
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
              : "Deployment started."
      );
    }
  }, [fetcher.data, onWorkspaceChange]);

  const submit = (command: StudioV2LifecycleCommand) =>
    fetcher.submit(command, { method: "post", encType: "application/json" });

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
      <Button
        type="button"
        variant="secondary/small"
        LeadingIcon={FlaskConicalIcon}
        disabled={!canWrite || busy || editorSaving}
        onClick={() => submit({ intent: "test", expectedVersion: workspace.version, input: null })}
      >
        Test
      </Button>
      <Button
        type="button"
        variant="secondary/small"
        LeadingIcon={CheckCircle2Icon}
        disabled={!canWrite || busy || editorSaving || !tested || Boolean(currentRelease)}
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
        disabled={!canWrite || busy || editorSaving || !rollbackTarget}
        onClick={() =>
          rollbackTarget && submit({ intent: "rollback", releasePublicId: rollbackTarget.publicId })
        }
      >
        Rollback
      </Button>
    </div>
  );
}
