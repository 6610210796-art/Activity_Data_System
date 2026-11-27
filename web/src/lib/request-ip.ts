import type { NextRequest } from "next/server";

export function requestIpAddress(request: NextRequest): string | null {
  const candidate = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? null;
  return candidate ? candidate.slice(0, 45) : null;
}

export function isBodyTooLarge(request: NextRequest, maxBytes: number): boolean {
  const header = request.headers.get("content-length");
  if (!header) return false;
  const length = Number(header);
  return Number.isFinite(length) && length > maxBytes;
}
