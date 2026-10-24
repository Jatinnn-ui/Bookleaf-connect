import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Used to keep login timing similar when the email does not exist.
let dummy: string | null = null;
export function dummyHash(): string {
  dummy ??= bcrypt.hashSync("timing-equaliser", ROUNDS);
  return dummy;
}
