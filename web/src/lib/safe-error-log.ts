export function logSafeServerError(event: string, error: unknown): void {
  const code = typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string"
    ? error.code
    : "unknown";
  console.error(event, { code });
}
