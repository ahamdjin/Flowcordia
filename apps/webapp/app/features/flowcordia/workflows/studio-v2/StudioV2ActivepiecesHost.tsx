import { useFetcher } from "@remix-run/react";
import { CheckCircle2Icon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StudioV2WorkspaceProjection } from "./workspace-contract";
import type { StudioV2WorkspaceActionData } from "./workspace-http";

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
  const testFetcher = useFetcher<StudioV2WorkspaceActionData>();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(
    workspace.testedVersion === workspace.version && workspace.lastTestSucceeded
      ? `Version ${workspace.version} passed structural testing.`
      : "Save changes in the Activepieces builder, then test the exact Flowcordia version."
  );
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
        setMessage(`Version ${event.data.version} saved. Test it before staging.`);
        onWorkspaceChange(event.data.workspace);
        return;
      }
      setError(event.data.message);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onWorkspaceChange]);

  useEffect(() => {
    const data = testFetcher.data;
    if (!data) return;
    if (!data.ok) {
      setError(data.message);
      return;
    }
    if (data.intent !== "test") return;
    setError(null);
    onWorkspaceChange(data.workspace);
    setMessage(
      data.test.success
        ? `Version ${data.test.version} passed structural testing.`
        : data.test.issues[0]?.message ?? `Version ${data.test.version} failed structural testing.`
    );
  }, [onWorkspaceChange, testFetcher.data]);

  const busy = testFetcher.state !== "idle";
  const tested = workspace.testedVersion === workspace.version && workspace.lastTestSucceeded === true;
  const runTest = () => {
    if (!canWrite || busy) return;
    setMessage(`Testing Flowcordia workspace version ${workspace.version}…`);
    testFetcher.submit(
      { intent: "test", expectedVersion: workspace.version },
      { method: "post", encType: "application/json" }
    );
  };

  return (
    <section
      data-testid="flowcordia-studio-v2-activepieces-host"
      data-studio-foundation="activepieces"
      className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0b0b0e] px-4 py-3 text-zinc-200">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span>Development</span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
              v{workspace.version}
            </span>
            {tested ? (
              <span className="flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300">
                <CheckCircle2Icon className="size-3" /> Tested
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-[10px] text-zinc-500">{message}</div>
        </div>
        <button
          type="button"
          onClick={runTest}
          disabled={!canWrite || busy}
          className="flex items-center gap-1.5 rounded-lg border border-indigo-400/25 bg-indigo-400/10 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-400/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlayIcon className="size-3.5" /> {busy ? "Testing…" : "Test"}
        </button>
      </div>
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
