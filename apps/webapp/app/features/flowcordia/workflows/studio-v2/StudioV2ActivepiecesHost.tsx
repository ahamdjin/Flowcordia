import { useEffect, useRef, useState } from "react";
import type { StudioV2WorkspaceProjection } from "./workspace-contract";

const MESSAGE_SOURCE = "flowcordia-studio-v2";
const HOST_SOURCE = "flowcordia-activepieces-studio";

interface StudioV2ActivepiecesHostProps {
  workspace: StudioV2WorkspaceProjection;
  projectId: string;
  canWrite: boolean;
  onWorkspaceChange(workspace: StudioV2WorkspaceProjection): void;
}

type HostMessage =
  | { source: typeof HOST_SOURCE; type: "ready" }
  | {
      source: typeof HOST_SOURCE;
      type: "saved";
      version: string;
      workspace: StudioV2WorkspaceProjection;
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
  const [error, setError] = useState<string | null>(null);
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
        setError(null);
        onWorkspaceChange(event.data.workspace);
        return;
      }
      setError(event.data.message);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onWorkspaceChange]);

  return (
    <section
      data-testid="flowcordia-studio-v2-activepieces-host"
      data-studio-foundation="activepieces"
      className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
    >
      {error ? (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        title="Flowcordia Studio workflow builder"
        src="/flowcordia-studio-activepieces/index.html"
        onLoad={sendBootstrap}
        sandbox="allow-forms allow-same-origin allow-scripts"
        className="block h-[780px] min-h-[680px] w-full border-0"
      />
    </section>
  );
}
