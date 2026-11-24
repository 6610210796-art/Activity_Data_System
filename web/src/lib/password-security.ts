import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 10) return "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร";
  return null;
}

export function generateTemporaryPassword(length = 14): string {
  const safeLength = Math.max(12, length);
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const all = `${lower}${upper}${numbers}`;
  const required = [
    lower[randomInt(lower.length)],
    upper[randomInt(upper.length)],
    numbers[randomInt(numbers.length)],
  ];
  const rest = Array.from({ length: safeLength - required.length }, () =>
    all[randomInt(all.length)],
  );
  const chars = [...required, ...rest];
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join("");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}
