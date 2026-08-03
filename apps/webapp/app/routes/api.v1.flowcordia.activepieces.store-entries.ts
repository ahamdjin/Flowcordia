import { randomUUID } from "node:crypto";
import { json, type ActionFunctionArgs } from "@remix-run/server-runtime";
import { Prisma } from "@trigger.dev/database";
import { z } from "zod";
import { prisma } from "~/db.server";
import {
  createActionApiRoute,
  createLoaderApiRoute,
} from "~/services/routeBuilders/apiBuilder.server";

const MAX_STORE_VALUE_BYTES = 512 * 1024;
const SearchParamsSchema = z.object({ key: z.string().min(1).max(128) });
const PutBodySchema = z.object({ key: z.string().min(1).max(128), value: z.unknown() });

function serializedValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > MAX_STORE_VALUE_BYTES) {
    throw new Response("Activepieces store value exceeds the upstream 512 KiB limit.", {
      status: 413,
    });
  }
  return serialized;
}

const loader = createLoaderApiRoute(
  {
    searchParams: SearchParamsSchema,
    findResource: async (_params, authentication) => authentication.environment,
  },
  async ({ searchParams, authentication }) => {
    const rows = await prisma.$queryRaw<Array<{ value: unknown }>>(Prisma.sql`
      SELECT "value"
      FROM "FlowcordiaActivepiecesStoreEntry"
      WHERE "runtimeEnvironmentId" = ${authentication.environment.id}
        AND "key" = ${searchParams.key}
      LIMIT 1
    `);
    if (!rows[0]) return json({ error: "Not found" }, { status: 404 });
    return json({ key: searchParams.key, value: rows[0].value });
  }
);

const postRoute = createActionApiRoute(
  { method: "POST", searchParams: SearchParamsSchema, body: PutBodySchema },
  async ({ body, searchParams, authentication }) => {
    if (body.key !== searchParams.key) return json({ error: "Store key mismatch" }, { status: 400 });
    const value = serializedValue(body.value);
    const now = new Date();
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "FlowcordiaActivepiecesStoreEntry" (
        "id", "runtimeEnvironmentId", "key", "value", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${authentication.environment.id}, ${body.key},
        CAST(${value} AS JSONB), ${now}, ${now}
      )
      ON CONFLICT ("runtimeEnvironmentId", "key") DO UPDATE
      SET "value" = EXCLUDED."value", "updatedAt" = EXCLUDED."updatedAt"
    `);
    return json({ key: body.key, value: body.value });
  }
);

const deleteRoute = createActionApiRoute(
  { method: "DELETE", searchParams: SearchParamsSchema },
  async ({ searchParams, authentication }) => {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "FlowcordiaActivepiecesStoreEntry"
      WHERE "runtimeEnvironmentId" = ${authentication.environment.id}
        AND "key" = ${searchParams.key}
    `);
    return json({});
  }
);

async function action(args: ActionFunctionArgs) {
  if (args.request.method.toUpperCase() === "DELETE") return deleteRoute.action(args);
  return postRoute.action(args);
}

export { action, loader };
