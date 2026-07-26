import { createHash } from "node:crypto";

const SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BOUNDED = /^[A-Za-z0-9 ._+:/()-]{1,160}$/;

const SESSION_REQUIREMENTS = {
  nvda_chrome_windows: { browser: "Chrome", operatingSystem: "Windows", assistiveTechnology: "NVDA" },
  nvda_firefox_windows: {
    browser: "Firefox",
    operatingSystem: "Windows",
    assistiveTechnology: "NVDA",
  },
  voiceover_safari_macos: {
    browser: "Safari",
    operatingSystem: "macOS",
    assistiveTechnology: "VoiceOver",
  },
} as const;

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

const VIEWPORT_REQUIREMENTS = {
  desktop_1280x720: { width: 1280, height: 720, inputMode: "keyboard_mouse" },
  tablet_landscape_1024x768: { width: 1024, height: 768, inputMode: "touch" },
  tablet_portrait_768x1024: { width: 768, height: 1024, inputMode: "touch" },
  phone_390x844: { width: 390, height: 844, inputMode: "touch" },
} as const;

const VIEWPORT_CHECKS = [
  "controls_visible",
  "touch_targets_usable",
  "empty_space_pan_isolated",
  "node_drag_isolated",
  "selection_reveal",
  "no_page_overflow",
  "zoom_200_percent",
] as const;

export type FlowcordiaCanvasManualRecord = {
  schemaVersion: "0.1";
  applicationCommitSha: string;
  referenceRepository: string;
  referenceCommitSha: string;
  workflows: {
    small: { workflowId: string; nodeCount: 5; edgeCount: number };
    production: { workflowId: string; nodeCount: number; edgeCount: number };
    stress: { workflowId: string; nodeCount: 300; edgeCount: number };
  };
  operator: string;
  startedAt: string;
  completedAt: string;
  sessions: Array<{
    id: keyof typeof SESSION_REQUIREMENTS;
    browser: { name: string; version: string };
    operatingSystem: { name: string; version: string };
    assistiveTechnology: { name: string; version: string };
    nodeCount: number;
    edgeCount: number;
    checks: Array<{ key: (typeof SESSION_CHECKS)[number]; state: "PASSED" }>;
  }>;
  viewports: Array<{
    id: keyof typeof VIEWPORT_REQUIREMENTS;
    width: number;
    height: number;
    devicePixelRatio: number;
    inputMode: "keyboard_mouse" | "touch";
    checks: Array<{ key: (typeof VIEWPORT_CHECKS)[number]; state: "PASSED" }>;
  }>;
  measurements: Array<{
    graph: "production_70" | "stress_300";
    nodeCount: number;
    edgeCount: number;
    initialFocusableMilliseconds: number;
    fitMilliseconds: number;
    arrowP95Milliseconds: number;
    arrowMaxMilliseconds: number;
    dragP95Milliseconds: number;
    dragMaxMilliseconds: number;
    peakMemoryMegabytes: number;
    longTasksOver50Milliseconds: number;
    browserCrash: false;
    freeze: false;
    lostEdits: 0;
    announcementsOrdered: true;
  }>;
  limitations: {
    multiTouchPinchAdvertised: false;
    unlimitedGraphScaleAdvertised: false;
    virtualizationAdvertised: false;
  };
  sensitiveDataRecorded: false;
};

export type FlowcordiaCanvasManualEvidence = FlowcordiaCanvasManualRecord & {
  kind: "flowcordia-canvas-manual-acceptance";
  state: "READY";
  source: {
    repository: string;
    workflowPath: ".github/workflows/flowcordia-canvas-manual-acceptance.yml";
    runId: string;
    runAttempt: number;
  };
  evidenceSha256: string;
};

const forbiddenKey =
  /(authorization|browserStorage|cookie|credential|database|email|header|internalActor|output|password|payload|privatePath|providerResponse|secret|token|url)/i;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertNoForbiddenKeys(value: unknown, path = "record"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKey.test(key)) throw new Error(`${path} contains forbidden field ${key}.`);
    assertNoForbiddenKeys(entry, `${path}.${key}`);
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !BOUNDED.test(value)) throw new Error(`${label} is malformed.`);
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} is outside the accepted boundary.`);
  }
  return Number(value);
}

function finite(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} is outside the accepted boundary.`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return new Date(value).toISOString();
}

function exactChecks(
  raw: unknown,
  expected: readonly string[],
  label: string
): Array<{ key: string; state: "PASSED" }> {
  if (!Array.isArray(raw) || raw.length !== expected.length) {
    throw new Error(`${label} must contain every fixed acceptance check.`);
  }
  const seen = new Set<string>();
  for (const entry of raw) {
    const check = object(entry, `${label} check`);
    const key = text(check.key, `${label} key`);
    if (!expected.includes(key) || seen.has(key) || check.state !== "PASSED") {
      throw new Error(`${label} contains a missing, repeated, unknown, or failed check.`);
    }
    seen.add(key);
  }
  return expected.map((key) => ({ key, state: "PASSED" as const }));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createFlowcordiaCanvasManualEvidence(input: {
  record: unknown;
  expectedApplicationCommitSha: string;
  repository: string;
  runId: string;
  runAttempt: number;
}): FlowcordiaCanvasManualEvidence {
  assertNoForbiddenKeys(input.record);
  const raw = object(input.record, "Canvas manual record");
  if (raw.schemaVersion !== "0.1") throw new Error("Canvas manual record schema is unsupported.");

  const expectedApplicationCommitSha = text(
    input.expectedApplicationCommitSha,
    "Expected application commit"
  );
  if (!SHA.test(expectedApplicationCommitSha) || raw.applicationCommitSha !== expectedApplicationCommitSha) {
    throw new Error("Canvas manual evidence does not belong to the exact candidate commit.");
  }
  const referenceRepository = text(raw.referenceRepository, "Reference repository").toLowerCase();
  if (!REPOSITORY.test(referenceRepository)) throw new Error("Reference repository is malformed.");
  const referenceCommitSha = text(raw.referenceCommitSha, "Reference commit");
  if (!SHA.test(referenceCommitSha)) throw new Error("Reference commit is malformed.");

  const workflows = object(raw.workflows, "Reference workflows");
  const small = object(workflows.small, "Small workflow");
  const production = object(workflows.production, "Production workflow");
  const stress = object(workflows.stress, "Stress workflow");
  const normalizedWorkflows = {
    small: {
      workflowId: text(small.workflowId, "Small workflow ID"),
      nodeCount: integer(small.nodeCount, "Small node count", 5, 5) as 5,
      edgeCount: integer(small.edgeCount, "Small edge count", 4, 20),
    },
    production: {
      workflowId: text(production.workflowId, "Production workflow ID"),
      nodeCount: integer(production.nodeCount, "Production node count", 70, 299),
      edgeCount: integer(production.edgeCount, "Production edge count", 69, 1000),
    },
    stress: {
      workflowId: text(stress.workflowId, "Stress workflow ID"),
      nodeCount: integer(stress.nodeCount, "Stress node count", 300, 300) as 300,
      edgeCount: integer(stress.edgeCount, "Stress edge count", 299, 2000),
    },
  };
  if (new Set(Object.values(normalizedWorkflows).map((workflow) => workflow.workflowId)).size !== 3) {
    throw new Error("Reference workflow identities must be distinct.");
  }

  if (!Array.isArray(raw.sessions) || raw.sessions.length !== 3) {
    throw new Error("The required browser and assistive-technology matrix is incomplete.");
  }
  const sessions = Object.entries(SESSION_REQUIREMENTS).map(([id, requirement]) => {
    const matching = raw.sessions.find((entry) => object(entry, "Session").id === id);
    const session = object(matching, `Session ${id}`);
    const browser = object(session.browser, `${id} browser`);
    const operatingSystem = object(session.operatingSystem, `${id} operating system`);
    const assistiveTechnology = object(
      session.assistiveTechnology,
      `${id} assistive technology`
    );
    if (
      browser.name !== requirement.browser ||
      operatingSystem.name !== requirement.operatingSystem ||
      assistiveTechnology.name !== requirement.assistiveTechnology
    ) {
      throw new Error(`Session ${id} does not match its required platform combination.`);
    }
    return {
      id: id as keyof typeof SESSION_REQUIREMENTS,
      browser: { name: requirement.browser, version: text(browser.version, `${id} browser version`) },
      operatingSystem: {
        name: requirement.operatingSystem,
        version: text(operatingSystem.version, `${id} operating-system version`),
      },
      assistiveTechnology: {
        name: requirement.assistiveTechnology,
        version: text(assistiveTechnology.version, `${id} assistive-technology version`),
      },
      nodeCount: integer(session.nodeCount, `${id} node count`, 70, 299),
      edgeCount: integer(session.edgeCount, `${id} edge count`, 69, 1000),
      checks: exactChecks(session.checks, SESSION_CHECKS, `Session ${id}`) as Array<{
        key: (typeof SESSION_CHECKS)[number];
        state: "PASSED";
      }>,
    };
  });

  if (!Array.isArray(raw.viewports) || raw.viewports.length !== 4) {
    throw new Error("The required low-resolution and touch matrix is incomplete.");
  }
  const viewports = Object.entries(VIEWPORT_REQUIREMENTS).map(([id, requirement]) => {
    const matching = raw.viewports.find((entry) => object(entry, "Viewport").id === id);
    const viewport = object(matching, `Viewport ${id}`);
    if (
      viewport.width !== requirement.width ||
      viewport.height !== requirement.height ||
      viewport.inputMode !== requirement.inputMode
    ) {
      throw new Error(`Viewport ${id} does not match its required dimensions or input mode.`);
    }
    return {
      id: id as keyof typeof VIEWPORT_REQUIREMENTS,
      width: requirement.width,
      height: requirement.height,
      devicePixelRatio: finite(viewport.devicePixelRatio, `${id} device-pixel ratio`, 0.5, 8),
      inputMode: requirement.inputMode,
      checks: exactChecks(viewport.checks, VIEWPORT_CHECKS, `Viewport ${id}`) as Array<{
        key: (typeof VIEWPORT_CHECKS)[number];
        state: "PASSED";
      }>,
    };
  });

  if (!Array.isArray(raw.measurements) || raw.measurements.length !== 2) {
    throw new Error("Both production and stress graph measurements are required.");
  }
  const measurements = (["production_70", "stress_300"] as const).map((graph) => {
    const matching = raw.measurements.find((entry) => object(entry, "Measurement").graph === graph);
    const measurement = object(matching, `Measurement ${graph}`);
    const expectedNodes = graph === "production_70" ? normalizedWorkflows.production.nodeCount : 300;
    if (measurement.nodeCount !== expectedNodes) {
      throw new Error(`Measurement ${graph} does not match the immutable reference graph.`);
    }
    if (
      measurement.browserCrash !== false ||
      measurement.freeze !== false ||
      measurement.lostEdits !== 0 ||
      measurement.announcementsOrdered !== true
    ) {
      throw new Error(`Measurement ${graph} contains a stop-ship browser outcome.`);
    }
    return {
      graph,
      nodeCount: expectedNodes,
      edgeCount: integer(measurement.edgeCount, `${graph} edge count`, expectedNodes - 1, 2000),
      initialFocusableMilliseconds: finite(
        measurement.initialFocusableMilliseconds,
        `${graph} initial focus time`,
        0,
        15_000
      ),
      fitMilliseconds: finite(measurement.fitMilliseconds, `${graph} fit time`, 0, 5_000),
      arrowP95Milliseconds: finite(
        measurement.arrowP95Milliseconds,
        `${graph} arrow p95`,
        0,
        1_000
      ),
      arrowMaxMilliseconds: finite(
        measurement.arrowMaxMilliseconds,
        `${graph} arrow maximum`,
        0,
        2_000
      ),
      dragP95Milliseconds: finite(
        measurement.dragP95Milliseconds,
        `${graph} drag p95`,
        0,
        1_000
      ),
      dragMaxMilliseconds: finite(
        measurement.dragMaxMilliseconds,
        `${graph} drag maximum`,
        0,
        2_000
      ),
      peakMemoryMegabytes: finite(
        measurement.peakMemoryMegabytes,
        `${graph} peak memory`,
        1,
        2_048
      ),
      longTasksOver50Milliseconds: integer(
        measurement.longTasksOver50Milliseconds,
        `${graph} long-task count`,
        0,
        10_000
      ),
      browserCrash: false as const,
      freeze: false as const,
      lostEdits: 0 as const,
      announcementsOrdered: true as const,
    };
  });

  const limitations = object(raw.limitations, "Canvas limitations");
  if (
    limitations.multiTouchPinchAdvertised !== false ||
    limitations.unlimitedGraphScaleAdvertised !== false ||
    limitations.virtualizationAdvertised !== false ||
    raw.sensitiveDataRecorded !== false
  ) {
    throw new Error("Canvas limitations or evidence privacy confirmation is invalid.");
  }

  const startedAt = timestamp(raw.startedAt, "Canvas acceptance start");
  const completedAt = timestamp(raw.completedAt, "Canvas acceptance completion");
  if (Date.parse(completedAt) <= Date.parse(startedAt)) {
    throw new Error("Canvas manual acceptance chronology is invalid.");
  }
  const runAttempt = integer(input.runAttempt, "Workflow attempt", 1, 1000);
  const repository = input.repository.toLowerCase();
  if (!REPOSITORY.test(repository)) throw new Error("Evidence repository is malformed.");

  const unsigned = {
    schemaVersion: "0.1" as const,
    kind: "flowcordia-canvas-manual-acceptance" as const,
    state: "READY" as const,
    applicationCommitSha: expectedApplicationCommitSha,
    referenceRepository,
    referenceCommitSha,
    workflows: normalizedWorkflows,
    operator: text(raw.operator, "Operator"),
    startedAt,
    completedAt,
    sessions,
    viewports,
    measurements,
    limitations: {
      multiTouchPinchAdvertised: false as const,
      unlimitedGraphScaleAdvertised: false as const,
      virtualizationAdvertised: false as const,
    },
    sensitiveDataRecorded: false as const,
    source: {
      repository,
      workflowPath: ".github/workflows/flowcordia-canvas-manual-acceptance.yml" as const,
      runId: text(input.runId, "Workflow run"),
      runAttempt,
    },
  };
  const evidenceSha256 = createHash("sha256").update(canonical(unsigned)).digest("hex");
  return { ...unsigned, evidenceSha256 };
}
