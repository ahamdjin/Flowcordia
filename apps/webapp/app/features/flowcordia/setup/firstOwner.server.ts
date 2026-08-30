import type { User } from "@trigger.dev/database";
import { prisma, type PrismaClientOrTransaction } from "~/db.server";
import { env } from "~/env.server";
import { featuresForUrl } from "~/features.server";
import {
  createAdminPasswordCredential,
  persistAdminPasswordCredential,
} from "~/services/passwordAuth.server";
import { isFirstOwnerClaimOpen, type FirstOwnerState } from "./firstOwnerState";

export { isFirstOwnerClaimOpen } from "./firstOwnerState";
export type { FirstOwnerState } from "./firstOwnerState";

const FIRST_OWNER_LOCK_ID = 1_744_320_019;

export type FirstOwnerClaimErrorCode = "not-self-hosted" | "claim-required" | "already-claimed";

export class FirstOwnerClaimError extends Error {
  constructor(
    public readonly code: FirstOwnerClaimErrorCode,
    message: string
  ) {
    super(message);
    this.name = "FirstOwnerClaimError";
  }
}

function isSelfHostedInstallation(): boolean {
  return !featuresForUrl(new URL(env.APP_ORIGIN)).isManagedCloud;
}

export async function getFirstOwnerState(
  prismaClient: PrismaClientOrTransaction = prisma
): Promise<FirstOwnerState> {
  const isSelfHosted = isSelfHostedInstallation();
  if (!isSelfHosted) {
    return { isSelfHosted, claimed: true };
  }

  const administrator = await prismaClient.user.findFirst({
    where: { admin: true },
    select: { id: true },
  });

  return {
    isSelfHosted,
    claimed: administrator !== null,
  };
}

export async function requireFirstOwnerClaimedForAuthentication(): Promise<void> {
  const state = await getFirstOwnerState();
  if (isFirstOwnerClaimOpen(state)) {
    throw new FirstOwnerClaimError(
      "claim-required",
      "This Flowcordia installation must be claimed before normal authentication can be used."
    );
  }
}

export async function claimFirstOwner(input: {
  email: string;
  name?: string;
  password: string;
}): Promise<User> {
  if (!isSelfHostedInstallation()) {
    throw new FirstOwnerClaimError(
      "not-self-hosted",
      "First-owner claiming is only available on self-hosted Flowcordia installations."
    );
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.name?.trim() || undefined;
  const credential = await createAdminPasswordCredential(input.password);

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FIRST_OWNER_LOCK_ID})`;

      const existingAdministrator = await tx.user.findFirst({
        where: { admin: true },
        select: { id: true },
      });
      if (existingAdministrator) {
        throw new FirstOwnerClaimError(
          "already-claimed",
          "This Flowcordia installation already has a platform administrator."
        );
      }

      const existingUser = await tx.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      });

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              email: normalizedEmail,
              admin: true,
              confirmedBasicDetails: true,
              ...(normalizedName
                ? {
                    name: existingUser.name ?? normalizedName,
                    displayName: existingUser.displayName ?? normalizedName,
                  }
                : {}),
            },
          })
        : await tx.user.create({
            data: {
              email: normalizedEmail,
              name: normalizedName,
              displayName: normalizedName,
              authenticationMethod: "MAGIC_LINK",
              admin: true,
              confirmedBasicDetails: true,
            },
          });

      await persistAdminPasswordCredential({
        userId: user.id,
        credential,
        prismaClient: tx,
      });

      return user;
    },
    { isolationLevel: "Serializable" }
  );
}
