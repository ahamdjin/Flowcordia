/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatingSystemContextProvider } from "~/components/primitives/OperatingSystemProvider";
import { ShortcutsProvider } from "~/components/primitives/ShortcutsProvider";
import { StudioV2SourceWorkspaceClient } from "./StudioV2SourceWorkspace.client";
import { createInitialStudioV2SourceWorkspace } from "./workspace-model";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class WebSocketStub {
  static instances: WebSocketStub[] = [];

  constructor(public readonly url: string | URL) {
    WebSocketStub.instances.push(this);
  }

  close() {}
  addEventListener() {}
  removeEventListener() {}
  send() {}
}

describe("StudioV2SourceWorkspaceClient", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    WebSocketStub.instances = [];

    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("WebSocket", WebSocketStub);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a focused editor without starting a CodeSandbox runtime", async () => {
    await act(async () => {
      root.render(
        createElement(
          OperatingSystemContextProvider,
          { platform: "windows" },
          createElement(
            ShortcutsProvider,
            null,
            createElement(StudioV2SourceWorkspaceClient, {
              workspace: createInitialStudioV2SourceWorkspace("workflow_123"),
            })
          )
        )
      );
    });

    expect(container.querySelector('[data-testid="flowcordia-source-workspace"]')).not.toBeNull();
    expect(container.textContent).toContain("workflow.ts");
    expect(container.textContent).toContain("Problems");
    expect(container.textContent).toContain("Output");
    expect(container.textContent).toContain("Logs");
    expect(container.textContent).toContain("Terminal");

    const lowerPanel = container.querySelector('[data-testid="flowcordia-source-lower-panel"]');
    expect(lowerPanel?.getAttribute("data-panel-state")).toBe("closed");
    expect(container.textContent).not.toContain("No output yet.");
    expect(container.querySelector('[data-testid="flowcordia-source-files"]')).toBeNull();

    const filesButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Files"
    );
    expect(filesButton).toBeDefined();
    await act(async () => filesButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('[data-testid="flowcordia-source-files"]')).not.toBeNull();

    const outputTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent?.trim() === "Output"
    );
    expect(outputTab).toBeDefined();
    await act(async () => outputTab?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(lowerPanel?.getAttribute("data-panel-state")).toBe("open");
    expect(container.textContent).toContain("No output yet.");

    const codeSandboxRequests = fetchSpy.mock.calls.filter(([input]) =>
      String(input).toLowerCase().includes("codesandbox")
    );
    const codeSandboxSockets = WebSocketStub.instances.filter(({ url }) =>
      String(url).toLowerCase().includes("codesandbox")
    );

    expect(codeSandboxRequests).toEqual([]);
    expect(codeSandboxSockets).toEqual([]);
  });
});
