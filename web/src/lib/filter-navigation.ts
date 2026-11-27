export type FilterValues = Record<string, string>;

/** Builds a clean query string and always returns filtered tables to page one. */
export function buildFilterQuery<T extends object>(values: T): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value && key !== "page") params.set(key, value);
  }
  return params.toString();
}

export function resetFilterPage<T extends object>(
  values: T,
): T & { page: string } {
  return { ...values, page: "1" };
}

/** Used by fetch-backed pages to ignore late responses from previous filters. */
export function isLatestRequest(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}
