export type AdminContentActor = {
  id: string;
  role: "admin" | "unit_user";
} | null;

export function authorizeAdminContent(actor: AdminContentActor) {
  if (!actor) return { allowed: false as const, status: 401 as const, error: "session" as const };
  if (actor.role !== "admin") return { allowed: false as const, status: 403 as const, error: "forbidden" as const };
  return { allowed: true as const, actor };
}

export function contentPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
}

export function validateContentValue(
  input: string,
  fallback: string,
  options: { required?: boolean; multiline?: boolean; maxLength?: number } = {},
): { value: string; error: "required" | "markup" | "length" | "control" | "placeholder" | null; placeholders: string[] } {
  const value = input.trim();
  const required = options.required ?? true;
  const multiline = options.multiline ?? /\r?\n/.test(fallback);
  const maxLength = options.maxLength ?? (multiline || fallback.length > 150 ? 2000 : 1000);
  const placeholders = contentPlaceholders(fallback);

  if (required && !value) return { value, error: "required", placeholders };
  if (/<\/?[a-z][^>]*>/i.test(value) || /<\s*script\b/i.test(value)) {
    return { value, error: "markup", placeholders };
  }
  if ([...value].length > maxLength) return { value, error: "length", placeholders };
  const disallowedControl = multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  if (disallowedControl.test(value)) return { value, error: "control", placeholders };

  const remaining = contentPlaceholders(value);
  const expectedCounts = new Map<string, number>();
  const actualCounts = new Map<string, number>();
  for (const placeholder of placeholders) expectedCounts.set(placeholder, (expectedCounts.get(placeholder) ?? 0) + 1);
  for (const placeholder of remaining) actualCounts.set(placeholder, (actualCounts.get(placeholder) ?? 0) + 1);
  for (const [placeholder, count] of expectedCounts) {
    if ((actualCounts.get(placeholder) ?? 0) < count) {
      return { value, error: "placeholder", placeholders };
    }
  }
  return { value, error: null, placeholders };
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function hasSameTimestamp(left: string | null, right: string | Date | null): boolean {
  if (left === null || right === null) return left === null && right === null;
  const leftTime = new Date(left).getTime();
  const rightTime = right instanceof Date ? right.getTime() : new Date(right).getTime();
  return Number.isFinite(leftTime) && leftTime === rightTime;
}

export function parseContentHistoryFilters(input: Record<string, string | null | undefined>) {
  const pageValue = input.page ?? "1";
  const pageNumber = /^\d+$/.test(pageValue) ? Number(pageValue) : 1;
  const validDate = (value: string | null | undefined) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  return {
    from: validDate(input.from),
    to: validDate(input.to),
    editor: (input.editor ?? "").slice(0, 64),
    group: (input.group ?? "").slice(0, 50),
    q: (input.q ?? "").slice(0, 150),
    page: Number.isSafeInteger(pageNumber) && pageNumber > 0 ? Math.min(pageNumber, 100000) : 1,
  };
}
