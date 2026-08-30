/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioV2ClientWorkspaceProjection } from "./client-contract";
import { StudioV2ActivepiecesHost } from "./StudioV2ActivepiecesHost";

function workspace(version: string): StudioV2ClientWorkspaceProjection {
  return {
    workspaceKey: "workflow:test",
    version,
    document: { id: "test", name: "Test workflow", nodes: [], edges: [] },
  } as unknown as StudioV2ClientWorkspaceProjection;
}

describe("StudioV2ActivepiecesHost", () => {
  let container: HTMLDivElement;
  let frame = 0;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      frame += 1;
      return frame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it("preserves the mounted editor until an external workspace version changes", () => {
    const root = createRoot(container);
    const renderHost = (active: boolean, version: string, onError = vi.fn()) =>
      root.render(
        createElement(StudioV2ActivepiecesHost, {
          workspace: workspace(version),
          projectId: "project_test",
          canWrite: true,
          active,
          onError,
          onWorkspaceChange: vi.fn(),
        })
      );

    act(() => renderHost(true, "1"));
    const iframe = container.querySelector("iframe");
    expect(iframe?.contentWindow).toBeTruthy();
    const postMessage = vi.spyOn(iframe!.contentWindow!, "postMessage");

    act(() => renderHost(true, "1", vi.fn()));
    act(() => renderHost(false, "1"));
    act(() => renderHost(true, "1"));
    expect(postMessage).not.toHaveBeenCalled();

    act(() => renderHost(false, "2"));
    expect(postMessage).not.toHaveBeenCalled();
    act(() => renderHost(true, "2"));
    expect(postMessage).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });
});
