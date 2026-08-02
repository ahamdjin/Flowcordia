import { describe, expect, it } from "vitest";
import {
  StudioV2ActivepiecesConnectionError,
  createStudioV2ActivepiecesConnectionAdapter,
  type StudioV2ActivepiecesConnectionSecretStore,
} from "./activepieces-connections.server";

function memoryStore() {
  const values = new Map<string, string>();
  const store: StudioV2ActivepiecesConnectionSecretStore = {
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

function secretConnection(externalId = "slack-main") {
  return {
    externalId,
    displayName: "Slack main",
    pieceName: "@activepieces/piece-slack",
    projectId: baseInput.projectId,
    type: "SECRET_TEXT",
    value: { type: "SECRET_TEXT", secret_text: "super-secret-token" },
    pieceVersion: "0.65.0",
  };
}

describe("Studio V2 Activepieces connection adapter", () => {
  it("stores the full connection envelope as a secret but never returns its value", async () => {
    const { store, values } = memoryStore();
    const handle = createStudioV2ActivepiecesConnectionAdapter(store);

    const created = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: "/v1/app-connections",
        body: secretConnection(),
      },
    })) as Record<string, unknown>;

    expect(created).toMatchObject({
      externalId: "slack-main",
      displayName: "Slack main",
      pieceName: "@activepieces/piece-slack",
      type: "SECRET_TEXT",
      status: "ACTIVE",
      scope: "PROJECT",
      projectIds: [baseInput.projectId],
    });
    expect(created).not.toHaveProperty("value");
    expect(values.size).toBe(1);
    const encryptedEnvelopeInput = Array.from(values.values())[0]!;
    expect(encryptedEnvelopeInput).toContain("super-secret-token");

    const listed = (await handle({
      ...baseInput,
      canWrite: false,
      command: {
        method: "GET",
        path: "/v1/app-connections",
        query: { pieceName: "@activepieces/piece-slack" },
      },
    })) as { data: Array<Record<string, unknown>> };
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).not.toHaveProperty("value");
    expect(JSON.stringify(listed)).not.toContain("super-secret-token");
  });

  it("upserts by externalId and preserves the stable Activepieces connection id", async () => {
    const { store } = memoryStore();
    const handle = createStudioV2ActivepiecesConnectionAdapter(store);
    const first = (await handle({
      ...baseInput,
      command: { method: "POST", path: "/v1/app-connections", body: secretConnection() },
    })) as { id: string };
    const second = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: "/v1/app-connections",
        body: { ...secretConnection(), displayName: "Slack renamed" },
      },
    })) as { id: string; displayName: string };

    expect(second.id).toBe(first.id);
    expect(second.displayName).toBe("Slack renamed");
  });

  it("keeps placeholder semantics without clobbering an active connection", async () => {
    const { store } = memoryStore();
    const handle = createStudioV2ActivepiecesConnectionAdapter(store);
    const active = (await handle({
      ...baseInput,
      command: { method: "POST", path: "/v1/app-connections", body: secretConnection() },
    })) as { id: string; displayName: string; status: string };

    const placeholder = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: "/v1/app-connections",
        body: {
          externalId: "slack-main",
          displayName: "Do not replace",
          pieceName: "@activepieces/piece-slack",
          projectId: baseInput.projectId,
          type: "PLACEHOLDER",
          pieceVersion: "0.65.0",
        },
      },
    })) as { id: string; displayName: string; status: string };

    expect(placeholder).toMatchObject({
      id: active.id,
      displayName: active.displayName,
      status: "ACTIVE",
    });
  });

  it("fills an existing placeholder with a real credential while preserving its id", async () => {
    const { store } = memoryStore();
    const handle = createStudioV2ActivepiecesConnectionAdapter(store);
    const placeholder = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: "/v1/app-connections",
        body: {
          externalId: "slack-pending",
          displayName: "Pending Slack",
          pieceName: "@activepieces/piece-slack",
          projectId: baseInput.projectId,
          type: "PLACEHOLDER",
          pieceVersion: "0.65.0",
        },
      },
    })) as { id: string; type: string; status: string };
    expect(placeholder).toMatchObject({ type: "NO_AUTH", status: "MISSING" });

    const active = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: "/v1/app-connections",
        body: secretConnection("slack-pending"),
      },
    })) as { id: string; type: string; status: string };
    expect(active).toMatchObject({ id: placeholder.id, type: "SECRET_TEXT", status: "ACTIVE" });
  });

  it("updates metadata without exposing or replacing the stored auth value", async () => {
    const { store, values } = memoryStore();
    const handle = createStudioV2ActivepiecesConnectionAdapter(store);
    const created = (await handle({
      ...baseInput,
      command: { method: "POST", path: "/v1/app-connections", body: secretConnection() },
    })) as { id: string };

    const updated = (await handle({
      ...baseInput,
      command: {
        method: "POST",
        path: `/v1/app-connections/${created.id}`,
        body: { displayName: "Slack production", metadata: { team: "platform" } },
      },
    })) as Record<string, unknown>;
    expect(updated).toMatchObject({ displayName: "Slack production", metadata: { team: "platform" } });
    expect(updated).not.toHaveProperty("value");
    expect(Array.from(values.values())[0]).toContain("super-secret-token");
  });

  it("deletes the environment-scoped secret and returns 404 on later reads", async () => {
    const { store, values } = memoryStore();
    const handle = createStudioV2ActivepiecesConnectionAdapter(store);
    const created = (await handle({
      ...baseInput,
      command: { method: "POST", path: "/v1/app-connections", body: secretConnection() },
    })) as { id: string };

    await handle({
      ...baseInput,
      command: { method: "DELETE", path: `/v1/app-connections/${created.id}` },
    });
    expect(values.size).toBe(0);
    await expect(
      handle({
        ...baseInput,
        command: { method: "GET", path: `/v1/app-connections/${created.id}` },
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("permission-gates mutations and keeps runtime-dependent operations fail-closed", async () => {
    const { store } = memoryStore();
    const handle = createStudioV2ActivepiecesConnectionAdapter(store);

    await expect(
      handle({
        ...baseInput,
        canWrite: false,
        command: { method: "POST", path: "/v1/app-connections", body: secretConnection() },
      })
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });

    await expect(
      handle({
        ...baseInput,
        command: { method: "POST", path: "/v1/app-connections/connection_123/revalidate", body: {} },
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<StudioV2ActivepiecesConnectionError>>({
        code: "activepieces_backend_not_mapped",
        status: 501,
      })
    );
  });
});
