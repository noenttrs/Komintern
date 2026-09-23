import argon2 from "argon2";

// argon2id avec les paramètres recommandés par l'OWASP (19 Mio, 2 itérations).
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Hash factice : vérifié quand l'email est inconnu, pour que le temps de réponse
// ne révèle pas quels emails ont un compte.
let dummyHash: Promise<string> | null = null;
export function dummyVerify(password: string): Promise<boolean> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  return dummyHash.then((hash) => verifyPassword(hash, password)).then(() => false);
}
