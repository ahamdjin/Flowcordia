import { describe, expect, it } from "vitest";
import {
  createFlowcordiaCanvasManualEvidence,
  type FlowcordiaCanvasManualRecord,
} from "../../app/features/flowcordia/acceptance/canvas-manual-acceptance";

const APPLICATION_SHA = "1123456789abcdef0123456789abcdef01234567";
const REFERENCE_SHA = "2123456789abcdef0123456789abcdef01234567";
const SESSION_CHECKS = [
  "canvas_region",
  "workflow_summary",
  "node_semantics",
  "connection_list",
  "geometric_navigation",
  "edge_creation",
  "invalid_target_rejection",
  "announced_feedback",
  "zoom_pan_move",
  "live_status",
] as const;
const VIEWPORT_CHECKS = [
  "controls_visible",
  "touch_targets_usable",
  "empty_space_pan_isolated",
  "node_drag_isolated",
  "selection_reveal",
  "no_page_overflow",
  "zoom_200_percent",
] as const;

function checks<T extends string>(keys: readonly T[]) {
  return keys.map((key) => ({ key, state: "PASSED" as const }));
}

function record(): FlowcordiaCanvasManualRecord {
  return {
    schemaVersion: "0.1",
    applicationCommitSha: APPLICATION_SHA,
    referenceRepository: "ahamdjin/flowcordia-beta-reference",
    referenceCommitSha: REFERENCE_SHA,
    workflows: {
      small: { workflowId: "canvas-small", nodeCount: 5, edgeCount: 5 },
      production: { workflowId: "canvas-production", nodeCount: 70, edgeCount: 82 },
      stress: { workflowId: "canvas-stress", nodeCount: 300, edgeCount: 340 },
    },
    operator: "Beta Acceptance Operator",
    startedAt: "2026-07-26T05:00:00.000Z",
    completedAt: "2026-07-26T07:00:00.000Z",
    sessions: [
      {
        id: "nvda_chrome_windows",
        browser: { name: "Chrome", version: "150.0.7339.12" },
        operatingSystem: { name: "Windows", version: "11 24H2" },
        assistiveTechnology: { name: "NVDA", version: "2026.2" },
        nodeCount: 70,
        edgeCount: 82,
        checks: checks(SESSION_CHECKS),
      },
      {
        id: "nvda_firefox_windows",
        browser: { name: "Firefox", version: "142.0" },
        operatingSystem: { name: "Windows", version: "11 24H2" },
        assistiveTechnology: { name: "NVDA", version: "2026.2" },
        nodeCount: 70,
        edgeCount: 82,
        checks: checks(SESSION_CHECKS),
      },
      {
        id: "voiceover_safari_macos",
        browser: { name: "Safari", version: "20.0" },
        operatingSystem: { name: "macOS", version: "27.0" },
        assistiveTechnology: { name: "VoiceOver", version: "27.0" },
        nodeCount: 70,
        edgeCount: 82,
        checks: checks(SESSION_CHECKS),
      },
    ],
    viewports: [
      {
        id: "desktop_1280x720",
        width: 1280,
        height: 720,
        devicePixelRatio: 1,
        inputMode: "keyboard_mouse",
        checks: checks(VIEWPORT_CHECKS),
      },
      {
        id: "tablet_landscape_1024x768",
        width: 1024,
        height: 768,
        devicePixelRatio: 2,
        inputMode: "touch",
        checks: checks(VIEWPORT_CHECKS),
      },
      {
        id: "tablet_portrait_768x1024",
        width: 768,
        height: 1024,
        devicePixelRatio: 2,
        inputMode: "touch",
        checks: checks(VIEWPORT_CHECKS),
      },
      {
        id: "phone_390x844",
        width: 390,
        height: 844,
        devicePixelRatio: 3,
        inputMode: "touch",
        checks: checks(VIEWPORT_CHECKS),
      },
    ],
    measurements: [
      {
        graph: "production_70",
        nodeCount: 70,
        edgeCount: 82,
        initialFocusableMilliseconds: 850,
        fitMilliseconds: 160,
        arrowP95Milliseconds: 34,
        arrowMaxMilliseconds: 110,
        dragP95Milliseconds: 44,
        dragMaxMilliseconds: 125,
        peakMemoryMegabytes: 410,
        longTasksOver50Milliseconds: 3,
        browserCrash: false,
        freeze: false,
        lostEdits: 0,
        announcementsOrdered: true,
      },
      {
        graph: "stress_300",
        nodeCount: 300,
        edgeCount: 340,
        initialFocusableMilliseconds: 1800,
        fitMilliseconds: 420,
        arrowP95Milliseconds: 68,
        arrowMaxMilliseconds: 220,
        dragP95Milliseconds: 92,
        dragMaxMilliseconds: 310,
        peakMemoryMegabytes: 780,
        longTasksOver50Milliseconds: 14,
        browserCrash: false,
        freeze: false,
        lostEdits: 0,
        announcementsOrdered: true,
      },
    ],
    limitations: {
      multiTouchPinchAdvertised: false,
      unlimitedGraphScaleAdvertised: false,
      virtualizationAdvertised: false,
    },
    sensitiveDataRecorded: false,
  };
}

function create(manualRecord: unknown = record()) {
  return createFlowcordiaCanvasManualEvidence({
    record: manualRecord,
    expectedApplicationCommitSha: APPLICATION_SHA,
    repository: "ahamdjin/flowcordia",
    runId: "30190000001",
    runAttempt: 1,
  });
}

describe("Flowcordia canvas manual acceptance", () => {
  it("preserves one exact complete human browser and scale matrix", () => {
    const evidence = create();
    expect(evidence).toMatchObject({
      schemaVersion: "0.1",
      kind: "flowcordia-canvas-manual-acceptance",
      state: "READY",
      applicationCommitSha: APPLICATION_SHA,
      referenceCommitSha: REFERENCE_SHA,
      sessions: [
        { id: "nvda_chrome_windows" },
        { id: "nvda_firefox_windows" },
        { id: "voiceover_safari_macos" },
      ],
      viewports: [
        { id: "desktop_1280x720", width: 1280, height: 720 },
        { id: "tablet_landscape_1024x768", width: 1024, height: 768 },
        { id: "tablet_portrait_768x1024", width: 768, height: 1024 },
        { id: "phone_390x844", width: 390, height: 844 },
      ],
      measurements: [{ graph: "production_70" }, { graph: "stress_300" }],
      source: {
        repository: "ahamdjin/flowcordia",
        workflowPath: ".github/workflows/flowcordia-canvas-manual-acceptance.yml",
        runId: "30190000001",
        runAttempt: 1,
      },
    });
    expect(evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an incomplete assistive-technology matrix and failed checks", () => {
    const incomplete = record();
    incomplete.sessions.pop();
    expect(() => create(incomplete)).toThrow(/matrix is incomplete/i);

    const failed = record() as FlowcordiaCanvasManualRecord & {
      sessions: Array<{ checks: Array<{ key: string; state: string }> }>;
    };
    failed.sessions[0].checks[0].state = "FAILED";
    expect(() => create(failed)).toThrow(/failed check/i);
  });

  it("rejects wrong viewport dimensions and stop-ship graph behavior", () => {
    const viewport = record();
    viewport.viewports[3].width = 400;
    expect(() => create(viewport)).toThrow(/required dimensions/i);

    const crash = record() as FlowcordiaCanvasManualRecord & {
      measurements: Array<{ browserCrash: boolean }>;
    };
    crash.measurements[1].browserCrash = true;
    expect(() => create(crash)).toThrow(/stop-ship browser outcome/i);
  });

  it("rejects mixed candidate identity, unsupported claims, and sensitive fields", () => {
    const mixed = record();
    mixed.applicationCommitSha = "3123456789abcdef0123456789abcdef01234567";
    expect(() => create(mixed)).toThrow(/exact candidate commit/i);

    const claim = record() as FlowcordiaCanvasManualRecord & {
      limitations: { multiTouchPinchAdvertised: boolean };
    };
    claim.limitations.multiTouchPinchAdvertised = true;
    expect(() => create(claim)).toThrow(/limitations/i);

    const sensitive = record() as FlowcordiaCanvasManualRecord & { browserStorage: string };
    sensitive.browserStorage = "must-not-enter-evidence";
    expect(() => create(sensitive)).toThrow(/forbidden field browserStorage/i);
  });
});
