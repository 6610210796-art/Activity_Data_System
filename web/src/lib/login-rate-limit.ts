import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failedAttempts = new Map<string, number[]>();

function accountKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function recentAttempts(key: string, now: number): number[] {
  const recent = (failedAttempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  if (recent.length === 0) {
    failedAttempts.delete(key);
  } else {
    failedAttempts.set(key, recent);
  }
  return recent;
}

function makeRoom(now: number): void {
  if (failedAttempts.size < 5000) {
    return;
  }

  for (const [key, timestamps] of failedAttempts) {
    const recent = timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
    if (recent.length === 0) {
      failedAttempts.delete(key);
    } else {
      failedAttempts.set(key, recent);
    }
  }

  if (failedAttempts.size >= 5000) {
    const oldestKey = failedAttempts.keys().next().value;
    if (oldestKey) {
      failedAttempts.delete(oldestKey);
    }
  }
}

export function getLoginLockSeconds(email: string): number {
  const now = Date.now();
  const attempts = recentAttempts(accountKey(email), now);
  if (attempts.length < MAX_FAILURES) {
    return 0;
  }
  return Math.max(1, Math.ceil((attempts[0] + WINDOW_MS - now) / 1000));
}

export function recordFailedLogin(email: string): number {
  const now = Date.now();
  const key = accountKey(email);
  if (!failedAttempts.has(key)) {
    makeRoom(now);
  }
  const attempts = recentAttempts(key, now);
  attempts.push(now);
  failedAttempts.set(key, attempts);
  return attempts.length >= MAX_FAILURES
    ? Math.max(1, Math.ceil((attempts[0] + WINDOW_MS - now) / 1000))
    : 0;
}

export function clearFailedLogins(email: string): void {
  failedAttempts.delete(accountKey(email));
}
