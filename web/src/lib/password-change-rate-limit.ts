import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const attempts = new Map<string, number[]>();

function keyFor(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

export function getPasswordChangeLockSeconds(userId: string): number {
  const key = keyFor(userId);
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  if (recent.length === 0) attempts.delete(key);
  else attempts.set(key, recent);
  if (recent.length < MAX_FAILURES) return 0;
  return Math.max(
    1,
    Math.ceil((recent[0] + WINDOW_MS - now) / 1000),
  );
}

export function recordPasswordChangeFailure(userId: string): number {
  const key = keyFor(userId);
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  recent.push(now);
  attempts.set(key, recent);
  if (recent.length < MAX_FAILURES) return 0;
  return Math.max(
    1,
    Math.ceil((recent[0] + WINDOW_MS - now) / 1000),
  );
}

export function clearPasswordChangeFailures(userId: string): void {
  attempts.delete(keyFor(userId));
}
