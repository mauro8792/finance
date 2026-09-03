import argon2 from "argon2";

// OWASP Password Storage Cheat Sheet: Argon2id, m=19456 KiB (19 MiB), t=2, p=1.
export const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

export const MIN_PASSWORD_LENGTH = 12;

const TIMING_DUMMY_PASSWORD = "timing-dummy-not-used-for-accounts";

let dummyHashPromise: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function verifyPasswordOrDummy(
  hash: string | null | undefined,
  password: string
): Promise<boolean> {
  dummyHashPromise ??= hashPassword(TIMING_DUMMY_PASSWORD);
  const dummy = await dummyHashPromise;
  return verifyPassword(hash && hash.startsWith("$argon2") ? hash : dummy, password);
}
