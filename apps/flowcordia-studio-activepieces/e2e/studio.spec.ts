import { expect, test, type Page } from "@playwright/test";

const workflow = {
  schemaVersion: "0.1",
  id: "browser_acceptance",
  name: "Browser acceptance",
  nodes: [
    {
      id: "manual_trigger",
      name: "Manual trigger",
      kind: "trigger",
      operation: "trigger.manual",
      position: { x: 80, y: 160 },
      configuration: {},
    },
    {
      id: "source",
      name: "Source",
      kind: "code",
      operation: "code.typescript",
      position: { x: 360, y: 160 },
      configuration: {
        language: "typescript",
        entrypoint: "run",
        source:
          "export default async function run(ctx: FlowcordiaContext) {\n  return { input: ctx.input };\n}",
        credentialReferences: [],
      },
      credentialReferences: [],
    },
    {
      id: "http_request",
      name: "HTTP Request",
      kind: "action",
      operation: "action.http",
      position: { x: 640, y: 160 },
      configuration: { method: "GET", url: "https://example.com" },
    },
    {
      id: "condition",
      name: "Condition",
      kind: "control",
      operation: "control.condition",
      position: { x: 920, y: 160 },
      configuration: { path: "status", operator: "equals", value: 200 },
    },
    {
      id: "success_output",
      name: "Success output",
      kind: "output",
      operation: "output.return",
      position: { x: 1200, y: 80 },
      configuration: {},
    },
    {
      id: "failure_output",
      name: "Failure output",
      kind: "output",
      operation: "output.return",
      position: { x: 1200, y: 260 },
      configuration: {},
    },
  ],
  edges: [
    { id: "manual_to_source", source: "manual_trigger", target: "source" },
    { id: "source_to_http", source: "source", target: "http_request" },
    { id: "http_to_condition", source: "http_request", target: "condition" },
    {
      id: "condition_true",
      source: "condition",
      target: "success_output",
      sourceHandle: "true",
      condition: "true",
    },
    {
      id: "condition_false",
      source: "condition",
      target: "failure_output",
      sourceHandle: "false",
      condition: "false",
    },
  ],
};

const manualTriggerPiece = {
  name: "@activepieces/piece-manual-trigger",
  displayName: "Manual Trigger",
  description: "Manually start a workflow.",
  logoUrl: "https://cdn.activepieces.com/pieces/new-core/manual-trigger.svg",
  version: "0.0.5",
  packageType: "REGISTRY",
  pieceType: "OFFICIAL",
  categories: ["CORE"],
  authors: ["Activepieces"],
  minimumSupportedRelease: "0.78.0",
  actions: {},
  triggers: {
    manual_trigger: {
      name: "manual_trigger",
      displayName: "Manual Trigger",
      description: "Manually start your workflow without extra configuration.",
      props: {},
      requireAuth: false,
    },
  },
};

const httpPiece = {
  name: "@activepieces/piece-http",
  displayName: "HTTP",
  description: "Send HTTP requests and return responses.",
  logoUrl: "https://cdn.activepieces.com/pieces/new-core/http.svg",
  version: "0.11.13",
  packageType: "REGISTRY",
  pieceType: "OFFICIAL",
  categories: ["CORE"],
  authors: ["Activepieces"],
  minimumSupportedRelease: "0.20.3",
  actions: {
    send_request: {
      name: "send_request",
      displayName: "Send HTTP request",
      description: "Send HTTP request",
      props: {},
      requireAuth: false,
      errorHandlingOptions: {
        continueOnFailure: { hide: true, defaultValue: false },
        retryOnFailure: { hide: true, defaultValue: false },
      },
    },
  },
  triggers: {},
};

const aiPiece = {
  name: "@activepieces/piece-ai",
  displayName: "AI",
  description: "AI actions and agents.",
  logoUrl: "https://cdn.activepieces.com/pieces/new-core/text-ai.svg",
  version: "0.4.7",
  packageType: "REGISTRY",
  pieceType: "OFFICIAL",
  categories: ["ARTIFICIAL_INTELLIGENCE", "UNIVERSAL_AI"],
  authors: ["anasbarg", "amrdb", "Louai-Zokerburg"],
  minimumSupportedRelease: "0.78.2",
  actions: {},
  triggers: {},
};

// Activepieces' pinned Approvals selector eagerly calls useMultiplePieces for
// these integrations before checking whether the Approvals tab is selected.
// They are intentionally browser-harness placeholders only: the server adapter
// tests are the authority for real release-compatible versions and metadata.
const approvalPrefetchPieces = [
  "@activepieces/piece-slack",
  "@activepieces/piece-discord",
  "@activepieces/piece-microsoft-teams",
  "@activepieces/piece-microsoft-outlook",
  "@activepieces/piece-gmail",
  "@activepieces/piece-telegram-bot",
].map((name) => ({
  name,
  displayName: name.replace("@activepieces/piece-", ""),
  description: "Browser acceptance prefetch fixture",
  logoUrl: "",
  version: "0.0.0",
  packageType: "REGISTRY",
  pieceType: "OFFICIAL",
  categories: [],
  authors: [],
  actions: {},
  triggers: {},
}));

const catalogPieces = [manualTriggerPiece, httpPiece, aiPiece];
const directPieceFixtures = new Map(
  [...catalogPieces, ...approvalPrefetchPieces].map((piece) => [piece.name, piece] as const)
);

const pieceRegistry = catalogPieces.map(({ name, version }) => ({ name, version }));

const pieceSummaries = catalogPieces.map((piece) => ({
  ...piece,
  actions: Object.keys(piece.actions).length,
  triggers: Object.keys(piece.triggers).length,
  suggestedActions: [],
  suggestedTriggers: [],
}));

async function canvasDiagnostics(page: Page) {
  return page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 5000),
    nodeCount: document.querySelectorAll(".react-flow__node").length,
    nodeIds: Array.from(document.querySelectorAll(".react-flow__node")).map(
      (element) => element.getAttribute("data-id") ?? element.id
    ),
  }));
}

function pieceNameFromPath(path: string) {
  const prefix = "/v1/pieces/";
  if (!path.startsWith(prefix)) return null;
  const encodedName = path.slice(prefix.length);
  if (!encodedName || encodedName === "registry") return null;
  return decodeURIComponent(encodedName);
}

function activepiecesRead(path: string) {
  if (path === "/v1/projects") {
    return {
      data: [
        {
          id: "project_browser",
          platformId: "flowcordia",
          displayName: "Flowcordia",
          type: "TEAM",
          releasesEnabled: false,
        },
      ],
      next: null,
      previous: null,
    };
  }
  if (/^\/v1\/platforms\/[^/]+$/.test(path)) {
    return {
      id: "flowcordia",
      name: "Flowcordia",
      plan: { environmentsEnabled: false },
    };
  }
  if (path === "/v1/folders" || path === "/v1/app-connections" || path === "/v1/variables") {
    return { data: [], next: null, previous: null };
  }
  if (path === "/v1/pieces") return pieceSummaries;
  if (path === "/v1/pieces/registry") return pieceRegistry;

  const pieceName = pieceNameFromPath(path);
  if (pieceName) {
    const piece = directPieceFixtures.get(pieceName);
    if (piece) return piece;
  }

  if (path === "/v1/ai-providers") return [];
  if (path.startsWith("/v1/flow-runs") || /^\/v1\/flows\/[^/]+\/versions$/.test(path)) {
    return { data: [], next: null, previous: null };
  }
  if (path.startsWith("/v1/git-repos")) return null;
  throw new Error(`Unexpected Activepieces browser acceptance read: ${path}`);
}

test("renders the upstream Activepieces builder and persists its operations through Flowcordia", async ({
  page,
}) => {
  let version = 1;
  const savedDocuments: Array<typeof workflow> = [];
  const browserErrors: string[] = [];
  const activepiecesRequests: string[] = [];

  page.on("pageerror", (error) => browserErrors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.route("**/studio-save", async (route) => {
    const command = route.request().postDataJSON() as
      | {
          intent: "save";
          expectedVersion: string;
          document: typeof workflow;
        }
      | {
          intent: "activepieces_api";
          method: "GET" | "POST" | "PATCH" | "DELETE";
          path: string;
          query?: Record<string, unknown>;
        };

    if (command.intent === "activepieces_api") {
      expect(command.method).toBe("GET");
      activepiecesRequests.push(command.path);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          intent: "activepieces_api",
          data: activepiecesRead(command.path),
        }),
      });
      return;
    }

    savedDocuments.push(command.document);
    version += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        intent: "save",
        workspace: {
          document: command.document,
          version: String(version),
          testedVersion: null,
          lastTestSucceeded: null,
        },
      }),
    });
  });

  await page.goto("./");
  await page.evaluate((document) => {
    window.postMessage(
      {
        source: "flowcordia-studio-v2",
        type: "bootstrap",
        projectId: "project_browser",
        expectedVersion: "1",
        readonly: false,
        actionUrl: "/studio-save",
        workflow: document,
      },
      window.location.origin
    );
  }, workflow);

  const sourceNode = page.locator('.react-flow__node[data-id="source"]');
  try {
    await expect(sourceNode).toBeVisible();
    await expect(page.getByText("Browser acceptance", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Flowcordia Studio")).toBeVisible();
    await expect(page.locator('[data-flowcordia-studio="builder"]')).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)"
    );
  } catch (error) {
    throw new Error(
      `Activepieces BuilderPage did not mount. Browser errors:\n${browserErrors.join("\n\n") || "none captured"}\nDiagnostics:\n${JSON.stringify(await canvasDiagnostics(page), null, 2)}`,
      { cause: error }
    );
  }

  await expect.poll(() => activepiecesRequests.length).toBeGreaterThan(0);
  expect(activepiecesRequests).toContain("/v1/pieces/@activepieces/piece-manual-trigger");
  await expect(page.locator(".flowcordia-studio-shell")).toHaveCount(0);
  await expect(
    page.getByText("Activepieces builder · Flowcordia contracts and permissions")
  ).toHaveCount(0);
  await expect(page.getByTestId("flowcordia-workflow-code-view")).toHaveCount(0);

  // Dispatch the click on Activepieces' own step-node element. React Flow's
  // outer positioning wrapper does not own the step-settings click handler.
  const sourceStep = sourceNode.locator('[data-step-context-menu="source"]');
  await expect(sourceStep).toBeVisible();
  await sourceStep.dispatchEvent("click");
  const sourceEditor = page.locator(".cm-content").first();
  await expect(sourceEditor).toBeVisible();
  await sourceEditor.fill(
    "export default async function run(ctx: FlowcordiaContext) {\n  return { edited: true, input: ctx.input };\n}"
  );
  await expect.poll(() => savedDocuments.length).toBeGreaterThan(0);
  await expect
    .poll(
      () => savedDocuments.at(-1)?.nodes.find((node) => node.id === "source")?.configuration.source
    )
    .toContain("edited: true");

  const addButtons = page.locator('[id*="big-add-button"] button');
  if ((await addButtons.count()) > 0) {
    // Trigger Activepieces' existing PieceSelector handler directly. Its own
    // floating canvas controls can overlap the button at this test viewport.
    await addButtons.first().dispatchEvent("click");
    await expect(page.getByText("Explore", { exact: true })).toBeVisible();
    await expect(page.getByText("Apps", { exact: true })).toBeVisible();
    await expect(page.getByText("Utility", { exact: true })).toBeVisible();
    await expect(page.getByText("Flowcordia nodes", { exact: true })).toHaveCount(0);
  }
});
