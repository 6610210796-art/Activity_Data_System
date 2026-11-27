import { createHash } from "node:crypto";

const WINDOW_MS = 60 * 1000;
const MAX_UPLOADS = 6;

export interface SiteUploadLimiter {
  attempts: Map<string, number[]>;
  now: () => number;
}

const defaultLimiter: SiteUploadLimiter = {
  attempts: new Map(),
  now: () => Date.now(),
};

function accountKey(actorId: string): string {
  return createHash("sha256").update(actorId).digest("hex");
}

function recentAttempts(limiter: SiteUploadLimiter, key: string, now: number): number[] {
  const recent = (limiter.attempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  if (recent.length === 0) {
    limiter.attempts.delete(key);
  } else {
    limiter.attempts.set(key, recent);
  }
  return recent;
}

export function consumeSiteUpload(
  actorId: string,
  limiter: SiteUploadLimiter = defaultLimiter,
): boolean {
  const now = limiter.now();
  const key = accountKey(actorId);
  const attempts = recentAttempts(limiter, key, now);
  if (attempts.length >= MAX_UPLOADS) return false;
  attempts.push(now);
  limiter.attempts.set(key, attempts);
  return true;
}
