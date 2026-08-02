import { describe, expect, it } from "vitest";
import {
  createStudioV2ActivepiecesVariableAdapter,
  type StudioV2ActivepiecesVariableSecretStore,
} from "./activepieces-variables.server";

function memoryStore() {
  const values = new Map<string, string>();
  const store: StudioV2ActivepiecesVariableSecretStore = {
    async list() {
      return Array.from(values, ([key, value]) => ({ key, value }));
    },
    async put(input) {
      values.set(input.key, input.value);
    },
    async delete(input) {
      values.delete(input.key);
    },
  };
  return { store, values };
}

const baseInput = {
  projectId: "project_123",
  environmentId: "environment_123",
  actorId: "user_123",
  canWrite: true,
} as const;

describe("Studio V2 Activepieces variable adapter", () => {
  it("stores plaintext only inside the secret envelope and never exposes it in normal responses", async () => {
    const { store, values } = memoryStore();
    const handle = createStudioV2ActivepiecesVariableAdapter(store);

    const created = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: "/v1/variables",
        body: { name: "API_TOKEN", value: "super-secret", metadata: { group: "tests" } },
      },
    })) as Record<string, unknown>;

    expect(created).toMatchObject({
      name: "API_TOKEN",
      projectId: baseInput.projectId,
      platformId: "flowcordia",
      ownerId: baseInput.actorId,
      metadata: { group: "tests" },
    });
    expect(created).not.toHaveProperty("value");
    expect(created).not.toHaveProperty("schemaVersion");
    expect(created).not.toHaveProperty("kind");
    expect(Array.from(values.values())[0]).toContain("super-secret");

    const listed = (await handle({
      ...baseInput,
      canWrite: false,
      command: { method: "GET", path: "/v1/variables" },
    })) as { data: Array<Record<string, unknown>> };
    expect(listed.data).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain("super-secret");
    expect(listed.data[0]).not.toHaveProperty("value");
  });

  it("rejects duplicate names instead of silently upserting", async () => {
    const { store } = memoryStore();
    const handle = createStudioV2ActivepiecesVariableAdapter(store);
    await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: "/v1/variables",
        body: { name: "API_TOKEN", value: "one" },
      },
    });

    await expect(
      handle({
        ...baseInput,
        command: {
          method: "POST",
          path: "/v1/variables",
          body: { name: "API_TOKEN", value: "two" },
        },
      })
    ).rejects.toMatchObject({ code: "validation", status: 400 });
  });

  it("supports name filtering and opaque pagination", async () => {
    const { store } = memoryStore();
    const handle = createStudioV2ActivepiecesVariableAdapter(store);
    for (const name of ["ALPHA_TOKEN", "BETA_TOKEN", "ALPHA_URL"]) {
      await handle({
        ...baseInput,
        command: {
          method: "POST",
          path: "/v1/variables",
          body: { name, value: name.toLowerCase() },
        },
      });
    }

    const first = (await handle({
      ...baseInput,
      canWrite: false,
      command: {
        method: "GET",
        path: "/v1/variables",
        query: { name: "alpha", limit: 1 },
      },
    })) as { data: Array<{ name: string }>; next: string | null };
    expect(first.data).toHaveLength(1);
    expect(first.data[0]?.name).toContain("ALPHA");
    expect(first.next).toMatch(/^flowcordia-variable:/);

    const second = (await handle({
      ...baseInput,
      canWrite: false,
      command: {
        method: "GET",
        path: "/v1/variables",
        query: { name: "alpha", limit: 1, cursor: first.next },
      },
    })) as { data: Array<{ name: string }> };
    expect(second.data).toHaveLength(1);
    expect(second.data[0]?.name).toContain("ALPHA");
    expect(second.data[0]?.name).not.toBe(first.data[0]?.name);
  });

  it("allows explicit reveal only for writable sessions", async () => {
    const { store } = memoryStore();
    const handle = createStudioV2ActivepiecesVariableAdapter(store);
    const created = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: "/v1/variables",
        body: { name: "API_TOKEN", value: "revealed-secret" },
      },
    })) as { id: string };

    await expect(
      handle({
        ...baseInput,
        canWrite: false,
        command: { method: "POST", path: `/v1/variables/${created.id}/reveal` },
      })
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });

    await expect(
      handle({
        ...baseInput,
        command: { method: "POST", path: `/v1/variables/${created.id}/reveal` },
      })
    ).resolves.toEqual({ value: "revealed-secret" });
  });

  it("updates value and metadata without renaming, including empty string values", async () => {
    const { store } = memoryStore();
    const handle = createStudioV2ActivepiecesVariableAdapter(store);
    const created = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: "/v1/variables",
        body: { name: "API_TOKEN", value: "initial" },
      },
    })) as { id: string; name: string };

    const updated = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: `/v1/variables/${created.id}`,
        body: { value: "", metadata: { group: "empty" } },
      },
    })) as Record<string, unknown>;
    expect(updated).toMatchObject({ name: created.name, metadata: { group: "empty" } });
    expect(updated).not.toHaveProperty("value");

    await expect(
      handle({
        ...baseInput,
        command: { method: "POST", path: `/v1/variables/${created.id}/reveal` },
      })
    ).resolves.toEqual({ value: "" });
  });

  it("deletes only the environment-scoped secret", async () => {
    const { store, values } = memoryStore();
    const handle = createStudioV2ActivepiecesVariableAdapter(store);
    const created = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: "/v1/variables",
        body: { name: "API_TOKEN", value: "initial" },
      },
    })) as { id: string };

    await handle({
      ...baseInput,
      command: { method: "DELETE", path: `/v1/variables/${created.id}` },
    });
    expect(values.size).toBe(0);
    await expect(
      handle({
        ...baseInput,
        command: { method: "POST", path: `/v1/variables/${created.id}/reveal` },
      })
    ).rejects.toMatchObject({ code: "entity_not_found", status: 404 });
  });
});
