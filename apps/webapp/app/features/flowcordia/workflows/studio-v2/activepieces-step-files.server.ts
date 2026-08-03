import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "~/db.server";
import { env } from "~/env.server";
import { findEnvironmentById } from "~/models/runtimeEnvironment.server";
import { generatePresignedUrl, uploadPacketToObjectStore } from "~/v3/objectStore.server";

const FILE_READ_AUDIENCE = "flowcordia:activepieces:file-read";
const FILE_READ_ISSUER = "flowcordia";
const FILE_READ_SECRET = new TextEncoder().encode(env.SESSION_SECRET);
const DEFAULT_ACTIVEPIECES_FILE_SIZE_MB = 25;
const DEFAULT_ACTIVEPIECES_RETENTION_DAYS = 30;

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function studioV2ActivepiecesMaxFileBytes(): number {
  return (
    positiveIntegerEnvironment("AP_MAX_FILE_SIZE_MB", DEFAULT_ACTIVEPIECES_FILE_SIZE_MB) *
    1024 *
    1024
  );
}

export function studioV2ActivepiecesRetentionDays(): number {
  return positiveIntegerEnvironment(
    "AP_EXECUTION_DATA_RETENTION_DAYS",
    DEFAULT_ACTIVEPIECES_RETENTION_DAYS
  );
}

function safeSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
  return sanitized || "unknown";
}

function boundedStream(input: ReadableStream<Uint8Array>, maxBytes: number) {
  let size = 0;
  const stream = input.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > maxBytes) {
          controller.error(
            new Error(`Activepieces step file exceeds the maximum allowed size of ${maxBytes} bytes`)
          );
          return;
        }
        controller.enqueue(chunk);
      },
    })
  );
  return { stream, size: () => size };
}

async function signReadToken(fileId: string, retentionDays: number): Promise<string> {
  return new SignJWT({ fileId, fileType: "FLOW_STEP_FILE" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(FILE_READ_ISSUER)
    .setAudience(FILE_READ_AUDIENCE)
    .setExpirationTime(`${retentionDays}d`)
    .sign(FILE_READ_SECRET);
}

export async function saveStudioV2ActivepiecesStepFile(input: {
  environmentId: string;
  workflowId: string;
  publicOrigin: string;
  data: ReadableStream<Uint8Array>;
  fileName: string;
  contentType: string;
  declaredSize?: number;
}): Promise<{ fileId: string; readUrl: string; size: number }> {
  const maxBytes = studioV2ActivepiecesMaxFileBytes();
  if (input.declaredSize !== undefined && input.declaredSize > maxBytes) {
    throw new Error(`Activepieces step file exceeds the maximum allowed size of ${maxBytes} bytes`);
  }

  const environment = await findEnvironmentById(input.environmentId);
  if (!environment) {
    throw new Error("Flowcordia runtime environment is unavailable for Activepieces step-file storage.");
  }

  const relativePath = [
    "flowcordia-activepieces",
    "flow-step-files",
    safeSegment(input.workflowId),
    randomUUID(),
  ].join("/");
  const bounded = boundedStream(input.data, maxBytes);
  const storagePath = await uploadPacketToObjectStore(
    relativePath,
    bounded.stream,
    input.contentType || "application/octet-stream",
    environment
  );
  const size = bounded.size();
  const retentionDays = studioV2ActivepiecesRetentionDays();
  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
  const row = await prisma.flowcordiaActivepiecesStepFile.create({
    data: {
      organizationId: environment.organizationId,
      projectId: environment.projectId,
      runtimeEnvironmentId: environment.id,
      workflowId: input.workflowId,
      storagePath,
      fileName: input.fileName,
      contentType: input.contentType || "application/octet-stream",
      size,
      metadata: { stepName: "trigger", flowId: input.workflowId },
      expiresAt,
    },
    select: { id: true },
  });
  const token = await signReadToken(row.id, retentionDays);
  const readUrl = new URL(
    `/api/v1/flowcordia/activepieces/files/${encodeURIComponent(row.id)}`,
    input.publicOrigin
  );
  readUrl.searchParams.set("token", token);
  return { fileId: row.id, readUrl: readUrl.toString(), size };
}

export async function readStudioV2ActivepiecesStepFile(input: {
  fileId: string;
  token: string;
}): Promise<{
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
  fileName: string;
  size: number | null;
}> {
  const verified = await jwtVerify(input.token, FILE_READ_SECRET, {
    issuer: FILE_READ_ISSUER,
    audience: FILE_READ_AUDIENCE,
    algorithms: ["HS256"],
  });
  if (
    verified.payload.fileId !== input.fileId ||
    verified.payload.fileType !== "FLOW_STEP_FILE"
  ) {
    throw new Error("Invalid Activepieces step-file read token.");
  }

  const file = await prisma.flowcordiaActivepiecesStepFile.findUnique({
    where: { id: input.fileId },
  });
  if (!file || file.expiresAt <= new Date()) {
    throw new Error("Activepieces step file was not found or has expired.");
  }
  const environment = await findEnvironmentById(file.runtimeEnvironmentId);
  if (!environment || environment.projectId !== file.projectId) {
    throw new Error("Flowcordia runtime environment is unavailable for Activepieces step-file read.");
  }
  const signed = await generatePresignedUrl(
    environment.project.externalRef,
    environment.slug,
    file.storagePath,
    "GET"
  );
  if (!signed.success) {
    throw new Error(`Failed to read Activepieces step file: ${signed.error}`);
  }
  const upstream = await fetch(signed.url, { method: "GET", redirect: "error" });
  if (!upstream.ok) {
    throw new Error(`Activepieces step-file object read failed with ${upstream.status}.`);
  }
  return {
    body: upstream.body,
    contentType: file.contentType,
    fileName: file.fileName,
    size: file.size,
  };
}
