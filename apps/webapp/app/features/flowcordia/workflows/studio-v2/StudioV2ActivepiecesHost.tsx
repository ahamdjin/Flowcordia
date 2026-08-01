import { useEffect, useRef } from "react";
import type { StudioV2ClientWorkspaceProjection } from "./client-contract";

const MESSAGE_SOURCE = "flowcordia-studio-v2";
const HOST_SOURCE = "flowcordia-activepieces-studio";

interface StudioV2ActivepiecesHostProps {
  workspace: StudioV2ClientWorkspaceProjection;
  projectId: string;
  canWrite: boolean;
  onWorkspaceChange(workspace: StudioV2ClientWorkspaceProjection): void;
}

type HostMessage =
  | { source: typeof HOST_SOURCE; type: "ready" }
  | {
      source: typeof HOST_SOURCE;
      type: "saved";
      version: string;
      workspace: StudioV2ClientWorkspaceProjection;
    }
  | { source: typeof HOST_SOURCE; type: "error"; message: string };

function isHostMessage(value: unknown): value is HostMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<HostMessage>;
  return message.source === HOST_SOURCE && typeof message.type === "string";
}

export function StudioV2ActivepiecesHost({
  workspace,
  projectId,
  canWrite,
  onWorkspaceChange,
}: StudioV2ActivepiecesHostProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latestBootstrap = useRef({ workspace, projectId, canWrite });
  latestBootstrap.current = { workspace, projectId, canWrite };

  const sendBootstrap = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const current = latestBootstrap.current;
    iframe.contentWindow.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: "bootstrap",
        projectId: current.projectId,
        expectedVersion: current.workspace.version,
        readonly: !current.canWrite,
        actionUrl: window.location.pathname,
        workflow: current.workspace.document,
      },
      window.location.origin
    );
  };

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow ||
        !isHostMessage(event.data)
      ) {
        return;
      }
      if (event.data.type === "ready") {
        sendBootstrap();
        return;
      }
      if (event.data.type === "saved") {
        onWorkspaceChange(event.data.workspace);
        return;
      }
      console.error("Flowcordia Activepieces Studio error:", event.data.message);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onWorkspaceChange]);

  return (
    <iframe
      ref={iframeRef}
      data-testid="flowcordia-studio-v2-activepieces-host"
      data-studio-foundation="activepieces"
      title="Flowcordia Studio workflow builder"
      src="/flowcordia-studio-activepieces/index.html"
      onLoad={sendBootstrap}
      sandbox="allow-forms allow-same-origin allow-scripts"
      className="block h-[calc(100vh-4rem)] min-h-[680px] w-full border-0 bg-background"
    />
  );
}
