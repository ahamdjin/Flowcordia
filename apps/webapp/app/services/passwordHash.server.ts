import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const FORMAT = "flowcordia-scrypt";
const VERSION = "1";
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
        maxmem: MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(Buffer.from(derivedKey));
      }
    );
  });
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(password, salt);

  return [
    FORMAT,
    VERSION,
    `n=${COST},r=${BLOCK_SIZE},p=${PARALLELIZATION}`,
    encode(salt),
    encode(derivedKey),
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  try {
    const [format, version, parameters, encodedSalt, encodedKey, ...rest] = encodedHash.split("$");
    if (
      format !== FORMAT ||
      version !== VERSION ||
      parameters !== `n=${COST},r=${BLOCK_SIZE},p=${PARALLELIZATION}` ||
      !encodedSalt ||
      !encodedKey ||
      rest.length > 0
    ) {
      return false;
    }

    const salt = decode(encodedSalt);
    const expectedKey = decode(encodedKey);
    if (salt.length !== SALT_LENGTH || expectedKey.length !== KEY_LENGTH) {
      return false;
    }

    const actualKey = await deriveKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
