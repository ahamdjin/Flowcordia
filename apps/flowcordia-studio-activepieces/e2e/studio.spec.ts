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
  return page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) return null;
      const rectangle = element.getBoundingClientRect();
      return { width: rectangle.width, height: rectangle.height };
    };
    const nodes = Array.from(document.querySelectorAll(".react-flow__node"));
    return {
      bodyText: document.body.innerText.slice(0, 5000),
      nodeCount: nodes.length,
      nodeIds: nodes.map((element) => element.getAttribute("data-id") ?? element.id),
      nodeTexts: nodes.map((element) => element.textContent?.trim() ?? ""),
      panel: bounds(".flowcordia-canvas-panel"),
      reactFlow: bounds(".react-flow"),
      viewportTransform: document.querySelector(".react-flow__viewport")?.getAttribute("style"),
    };
  });
}

async function assertNoWorkflowCodeIssues(page: Page) {
  try {
    await expect(page.getByText("Canvas synchronized")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  } catch (error) {
    const issues = await page.getByRole("alert").allTextContents();
    throw new Error(`Whole-workflow code became invalid:\n${issues.join("\n") || "no issue text"}`, {
      cause: error,
    });
  }
}

test("keeps the real Activepieces canvas and whole-workflow code synchronized", async ({ page }) => {
  let version = 1;
  const savedDocuments: Array<typeof workflow> = [];
  const browserErrors: string[] = [];

  page.on("pageerror", (error) => {
    const message = error.stack ?? error.message;
    browserErrors.push(message);
    console.error(`[studio pageerror] ${message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    browserErrors.push(text);
    console.error(`[studio console] ${text}`);
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
  await expect(page.getByText("Opening Flowcordia Studio")).toBeVisible();
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

  try {
    await expect(
      page.getByText("Activepieces builder · Flowcordia contracts and permissions")
    ).toBeVisible();
  } catch (error) {
    throw new Error(
      `Studio did not mount after bootstrap. Browser errors:\n${browserErrors.join("\n\n") || "none captured"}`,
      { cause: error }
    );
  }

  const sourceNode = page.locator('.react-flow__node[data-id="source"]');
  try {
    await expect(sourceNode).toBeVisible();
  } catch (error) {
    throw new Error(
      `Source node did not render. Browser errors:\n${browserErrors.join("\n\n") || "none captured"}\nCanvas diagnostics:\n${JSON.stringify(await canvasDiagnostics(page), null, 2)}`,
      { cause: error }
    );
  }

  await sourceNode.click();
  await expect(page.getByRole("button", { name: "Open full view" })).toBeVisible();
  await page.getByRole("button", { name: "Open full view" }).click();
  await expect(page.getByRole("button", { name: "Close full view" })).toBeVisible();

  const sourceEditor = page.locator(".cm-content").first();
  await expect(sourceEditor).toBeVisible();
  await sourceEditor.fill(
    "export default async function run(ctx: FlowcordiaContext) {\n  return { edited: true, input: ctx.input };\n}"
  );
  await expect.poll(() => savedDocuments.length).toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        savedDocuments
          .at(-1)
          ?.nodes.find((node) => node.id === "source")
          ?.configuration.source
    )
    .toContain("edited: true");

  await page.getByRole("button", { name: "Close full view" }).click();
  const addButtons = page.locator('[id*="big-add-button"] button');
  await expect(addButtons.first()).toBeVisible();
  await addButtons.first().click();
  await expect(page.getByText("Flowcordia nodes")).toBeVisible();
  await page
    .getByRole("button", { name: "HTTP Request Call an external API", exact: true })
    .click();
  await expect
    .poll(
      () =>
        savedDocuments
          .at(-1)
          ?.nodes.filter((node) => node.operation === "action.http").length ?? 0
    )
    .toBe(2);

  await page.getByRole("button", { name: "Code", exact: true }).click();
  const codeView = page.getByTestId("flowcordia-workflow-code-view");
  await expect(codeView).toBeVisible();
  await assertNoWorkflowCodeIssues(page);

  const workflowEditor = codeView.locator(".cm-content").first();
  const completeSource = page.getByTestId("flowcordia-workflow-code-source");
  const currentCode = await completeSource.inputValue();
  expect(currentCode).toContain('"name": "Browser acceptance"');
  expect(currentCode).toContain("edited: true");
  await workflowEditor.fill(
    currentCode.replace('"name": "Browser acceptance"', '"name": "Edited in whole code"')
  );
  await assertNoWorkflowCodeIssues(page);
  await expect.poll(() => savedDocuments.at(-1)?.name).toBe("Edited in whole code");

  const sourceNodeButton = page
    .locator(".flowcordia-workflow-code-node-list button")
    .filter({ hasText: "Source" })
    .first();
  await sourceNodeButton.click();
  await page.getByRole("button", { name: "Open node settings" }).click();
  await expect(page.getByRole("button", { name: "Open full view" })).toBeVisible();

  await page.getByRole("button", { name: "Code", exact: true }).click();
  const secondWorkflowEditor = page
    .getByTestId("flowcordia-workflow-code-view")
    .locator(".cm-content")
    .first();
  await secondWorkflowEditor.fill(
    'import { defineWorkflow } from "@flowcordia/workflow";\nexport default defineWorkflow({'
  );
  await expect(page.getByText("Last valid canvas preserved")).toBeVisible();
  const savesBeforeReturning = savedDocuments.length;
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator('.react-flow__node[data-id="source"]')).toBeVisible();
  expect(savedDocuments).toHaveLength(savesBeforeReturning);
});
