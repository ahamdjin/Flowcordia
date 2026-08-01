import { describe, expect, it } from "vitest";
import { executeStudioV2TypeScriptSource } from "./source-runtime";

describe("Studio V2 TypeScript Source runtime", () => {
  it("executes TypeScript with workflow context and declared credential values", async () => {
    const output = await executeStudioV2TypeScriptSource({
      document: {
        language: "typescript",
        entrypoint: "run",
        credentialReferences: ["billing-api"],
        source: `export default async function run(ctx: FlowcordiaContext) {
          const credential = await ctx.credentials.get("billing-api");
          return {
            input: ctx.input,
            prior: ctx.steps.prepare,
            variable: ctx.variables.region,
            credential,
            environment: ctx.execution.environment,
          };
        }`,
      },
      context: {
        input: { orderId: "order_123" },
        steps: { prepare: { total: 42 } },
        variables: { region: "eu-west" },
        execution: {
          workflowId: "checkout",
          nodeId: "source",
          environment: "test",
          runId: "run_123",
          attempt: 1,
        },
      },
      credentials: { "billing-api": { token: "runtime-only" } },
      timeoutMs: 5_000,
    });

    expect(output).toEqual({
      input: { orderId: "order_123" },
      prior: { total: 42 },
      variable: "eu-west",
      credential: { token: "runtime-only" },
      environment: "test",
    });
  }, 20_000);

  it("denies undeclared credential access", async () => {
    await expect(
      executeStudioV2TypeScriptSource({
        document: {
          language: "typescript",
          entrypoint: "run",
          credentialReferences: [],
          source: `export default async function run(ctx: FlowcordiaContext) {
            return ctx.credentials.get("missing");
          }`,
        },
        context: {
          input: null,
          steps: {},
          variables: {},
          execution: { workflowId: "test", nodeId: "source", environment: "test" },
        },
        credentials: {},
      })
    ).rejects.toThrow('Credential reference "missing" is not available');
  }, 20_000);
});
