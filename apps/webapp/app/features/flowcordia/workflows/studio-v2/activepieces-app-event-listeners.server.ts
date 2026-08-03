import { prisma } from "~/db.server";

const SIMULATION_LISTENER_TTL_MS = 10 * 60 * 1000;

export type StudioV2ActivepiecesAppListener = {
  events: string[];
  identifierValue: string;
};

async function deleteExpiredSimulationListeners(now = new Date()): Promise<void> {
  await prisma.flowcordiaActivepiecesAppEventListener.deleteMany({
    where: {
      mode: "SIMULATION",
      expiresAt: { lte: now },
    },
  });
}

export async function replaceStudioV2ActivepiecesSimulationAppListeners(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
  workflowId: string;
  pieceName: string;
  pieceVersion: string;
  triggerName: string;
  simulationId: string;
  simulationRunId: string;
  appListeners: StudioV2ActivepiecesAppListener[];
}): Promise<void> {
  const expiresAt = new Date(Date.now() + SIMULATION_LISTENER_TTL_MS);
  const listeners = input.appListeners.flatMap((listener) =>
    listener.events.map((event) => ({
      organizationId: input.organizationId,
      projectId: input.projectId,
      runtimeEnvironmentId: input.environmentId,
      workflowId: input.workflowId,
      nodeId: null,
      pieceName: input.pieceName,
      pieceVersion: input.pieceVersion,
      triggerName: input.triggerName,
      event,
      identifierValue: listener.identifierValue,
      mode: "SIMULATION",
      simulationId: input.simulationId,
      simulationRunId: input.simulationRunId,
      createdByUserId: input.actorId,
      expiresAt,
    }))
  );

  await prisma.$transaction(async (tx) => {
    await tx.flowcordiaActivepiecesAppEventListener.deleteMany({
      where: { simulationId: input.simulationId },
    });
    if (listeners.length > 0) {
      await tx.flowcordiaActivepiecesAppEventListener.createMany({
        data: listeners,
        skipDuplicates: true,
      });
    }
  });
}

export async function deleteStudioV2ActivepiecesSimulationAppListeners(input: {
  simulationId: string;
}): Promise<void> {
  await prisma.flowcordiaActivepiecesAppEventListener.deleteMany({
    where: { simulationId: input.simulationId },
  });
}

export async function findStudioV2ActivepiecesAppEventParserHost(input: { pieceName: string }) {
  const now = new Date();
  await deleteExpiredSimulationListeners(now);
  return prisma.flowcordiaActivepiecesAppEventListener.findFirst({
    where: {
      mode: "SIMULATION",
      pieceName: input.pieceName,
      createdByUserId: { not: null },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listStudioV2ActivepiecesSimulationAppListeners(input: {
  pieceName: string;
  event: string;
  identifierValue: string;
}) {
  const now = new Date();
  await deleteExpiredSimulationListeners(now);
  return prisma.flowcordiaActivepiecesAppEventListener.findMany({
    where: {
      mode: "SIMULATION",
      pieceName: input.pieceName,
      event: input.event,
      identifierValue: input.identifierValue,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "asc" },
  });
}
