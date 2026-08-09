import { useCallback, useEffect, useRef } from "react";
import type { StudioV2ClientWorkspaceProjection } from "./client-contract";

const MESSAGE_SOURCE = "flowcordia-studio-v2";
const HOST_SOURCE = "flowcordia-activepieces-studio";
const STUDIO_V2_ROUTE_ID =
  "routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.studio-v2";

interface StudioV2ActivepiecesHostProps {
  workspace: StudioV2ClientWorkspaceProjection;
  projectId: string;
  canWrite: boolean;
  active?: boolean;
  onSavingChange?(saving: boolean): void;
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
  | { source: typeof HOST_SOURCE; type: "saving"; saving: boolean }
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
  active = true,
  onSavingChange,
  onWorkspaceChange,
}: StudioV2ActivepiecesHostProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latestBootstrap = useRef({ workspace, projectId, canWrite });
  const wasActiveRef = useRef(active);
  latestBootstrap.current = { workspace, projectId, canWrite };

  const sendBootstrap = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const current = latestBootstrap.current;
    const actionUrl = new URL(window.location.href);
    actionUrl.searchParams.set("_data", STUDIO_V2_ROUTE_ID);
    actionUrl.searchParams.set("_studioWorkspace", current.workspace.workspaceKey);
    iframe.contentWindow.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: "bootstrap",
        projectId: current.projectId,
        expectedVersion: current.workspace.version,
        readonly: !current.canWrite,
        actionUrl: `${actionUrl.pathname}${actionUrl.search}`,
        workflow: current.workspace.document,
      },
      window.location.origin
    );
  }, []);

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
      if (event.data.type === "saving") {
        onSavingChange?.(event.data.saving);
        return;
      }
      console.error("Flowcordia Activepieces Studio error:", event.data.message);
    };
    window.addEventListener("message", receive);
    sendBootstrap();
    return () => window.removeEventListener("message", receive);
  }, [onSavingChange, onWorkspaceChange, sendBootstrap]);

  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    if (!becameActive) return;

    let secondFrame: number | undefined;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        iframeRef.current?.contentWindow?.dispatchEvent(new Event("resize"));
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
    };
  }, [active]);

  return (
    <iframe
      ref={iframeRef}
      data-testid="flowcordia-studio-v2-activepieces-host"
      data-studio-foundation="activepieces"
      title="Flowcordia Studio workflow builder"
      src="/flowcordia-studio-activepieces/index.html"
      onLoad={sendBootstrap}
      sandbox="allow-forms allow-same-origin allow-scripts"
      aria-hidden={!active}
      tabIndex={active ? 0 : -1}
      className="block h-full min-h-0 w-full border-0 bg-background"
    />
  );
}
