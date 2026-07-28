import type { User } from "@trigger.dev/database";
import { z } from "zod";
import { prisma, type PrismaClientOrTransaction } from "~/db.server";
import { getSecretStore } from "~/services/secrets/secretStore.server";
import { hashPassword, verifyPassword } from "./passwordHash.server";
import { postAuthentication } from "./postAuth.server";

const PASSWORD_KEY_PREFIX = "flowcordia:auth:password:";
const PASSWORD_CREDENTIAL_VERSION = "1" as const;

export const AdminPasswordSchema = z
  .string()
  .min(15, "Password must contain at least 15 characters.")
  .max(128, "Password must not exceed 128 characters.");

const StoredPasswordCredentialSchema = z.object({
  version: z.literal(PASSWORD_CREDENTIAL_VERSION),
  passwordHash: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export type StoredPasswordCredential = z.infer<typeof StoredPasswordCredentialSchema>;

export type SetAdminPasswordResult =
  | { success: true }
  | {
      success: false;
      message: string;
      field?: "currentPassword" | "newPassword";
    };

function credentialKey(userId: string): string {
  return `${PASSWORD_KEY_PREFIX}${userId}`;
}

function credentialStore(prismaClient: PrismaClientOrTransaction = prisma) {
  return getSecretStore("DATABASE", { prismaClient });
}

async function getCredential(
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma
): Promise<StoredPasswordCredential | undefined> {
  return credentialStore(prismaClient).getSecret(
    StoredPasswordCredentialSchema,
    credentialKey(userId)
  );
}

let dummyPasswordHash: Promise<string> | undefined;
function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword("Flowcordia invalid local administrator credential");
  return dummyPasswordHash;
}

export async function createAdminPasswordCredential(
  password: string
): Promise<StoredPasswordCredential> {
  const parsedPassword = AdminPasswordSchema.parse(password);
  return {
    version: PASSWORD_CREDENTIAL_VERSION,
    passwordHash: await hashPassword(parsedPassword),
    updatedAt: new Date().toISOString(),
  };
}

export async function persistAdminPasswordCredential(input: {
  userId: string;
  credential: StoredPasswordCredential;
  prismaClient?: PrismaClientOrTransaction;
}): Promise<void> {
  const prismaClient = input.prismaClient ?? prisma;
  const user = await prismaClient.user.findUnique({ where: { id: input.userId } });
  if (!user?.admin) {
    throw new Error("Only a platform administrator can receive a local password credential.");
  }

  await credentialStore(prismaClient).setSecret(credentialKey(user.id), input.credential);
}

export async function hasAdminPassword(userId: string): Promise<boolean> {
  return (await getCredential(userId)) !== undefined;
}

export async function authenticateAdminPassword(
  email: string,
  password: string
): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
  });
  const credential = user?.admin ? await getCredential(user.id) : undefined;
  const passwordHash = credential?.passwordHash ?? (await getDummyPasswordHash());
  const passwordMatches = await verifyPassword(password, passwordHash);

  if (!user?.admin || !credential || !passwordMatches) {
    return null;
  }

  await postAuthentication({
    user,
    isNewUser: false,
    loginMethod: user.authenticationMethod,
  });

  return user;
}

export async function setAdminPassword(input: {
  userId: string;
  currentPassword?: string;
  newPassword: string;
}): Promise<SetAdminPasswordResult> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user?.admin) {
    return { success: false, message: "Only a platform administrator can manage this password." };
  }

  const parsedPassword = AdminPasswordSchema.safeParse(input.newPassword);
  if (!parsedPassword.success) {
    return {
      success: false,
      message: parsedPassword.error.issues[0]?.message ?? "Choose a stronger password.",
      field: "newPassword",
    };
  }

  const existingCredential = await getCredential(user.id);
  if (existingCredential) {
    if (!input.currentPassword) {
      return {
        success: false,
        message: "Enter the current password before changing it.",
        field: "currentPassword",
      };
    }

    const currentPasswordMatches = await verifyPassword(
      input.currentPassword,
      existingCredential.passwordHash
    );
    if (!currentPasswordMatches) {
      return {
        success: false,
        message: "The current password is incorrect.",
        field: "currentPassword",
      };
    }

    if (await verifyPassword(parsedPassword.data, existingCredential.passwordHash)) {
      return {
        success: false,
        message: "Choose a password different from the current password.",
        field: "newPassword",
      };
    }
  }

  const credential = await createAdminPasswordCredential(parsedPassword.data);
  await persistAdminPasswordCredential({ userId: user.id, credential });
  return { success: true };
}
