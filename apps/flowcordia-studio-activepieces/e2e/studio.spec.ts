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

async function canvasDiagnostics(page: Page) {
  return page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 5000),
    nodeCount: document.querySelectorAll(".react-flow__node").length,
    nodeIds: Array.from(document.querySelectorAll(".react-flow__node")).map(
      (element) => element.getAttribute("data-id") ?? element.id
    ),
  }));
}

test("renders the upstream Activepieces builder and persists its operations through Flowcordia", async ({
  page,
}) => {
  let version = 1;
  const savedDocuments: Array<typeof workflow> = [];
  const browserErrors: string[] = [];

  page.on("pageerror", (error) => browserErrors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.route("**/studio-save", async (route) => {
    const command = route.request().postDataJSON() as {
      intent: string;
      expectedVersion: string;
      document: typeof workflow;
    };
    expect(command.intent).toBe("save");
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
  } catch (error) {
    throw new Error(
      `Activepieces BuilderPage did not mount. Browser errors:\n${browserErrors.join("\n\n") || "none captured"}\nDiagnostics:\n${JSON.stringify(await canvasDiagnostics(page), null, 2)}`,
      { cause: error }
    );
  }

  await expect(page.locator(".flowcordia-studio-shell")).toHaveCount(0);
  await expect(page.getByText("Activepieces builder · Flowcordia contracts and permissions")).toHaveCount(
    0
  );
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
    await addButtons.first().click();
    await expect(page.getByText("Explore", { exact: true })).toBeVisible();
    await expect(page.getByText("Apps", { exact: true })).toBeVisible();
    await expect(page.getByText("Utility", { exact: true })).toBeVisible();
    await expect(page.getByText("Flowcordia nodes", { exact: true })).toHaveCount(0);
  }
});
