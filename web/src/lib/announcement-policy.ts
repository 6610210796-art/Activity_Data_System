export type AnnouncementStatus = "active" | "upcoming" | "expired" | "inactive";

export interface AnnouncementDateRange {
  startDate: string;
  endDate: string | null;
  isActive: boolean | number;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean | number;
}

export type AnnouncementValidationError =
  | "required"
  | "title_length"
  | "body_length"
  | "markup"
  | "control"
  | "date"
  | "order";

export type AnnouncementValidationResult =
  | { ok: true; value: Omit<AnnouncementInput, "endDate"> & { endDate: string | null } }
  | { ok: false; error: AnnouncementValidationError };

const MONTH_NAMES_TH = [
  "",
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function getBangkokToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function formatThaiShortDate(value: string): string | null {
  if (!isValidCalendarDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${MONTH_NAMES_TH[month]} ${year + 543}`;
}

export function getAnnouncementStatus(
  item: AnnouncementDateRange,
  today: string,
): AnnouncementStatus {
  if (!item.isActive) return "inactive";
  if (today < item.startDate) return "upcoming";
  if (item.endDate !== null && today > item.endDate) return "expired";
  return "active";
}

export function isAnnouncementVisible(
  item: AnnouncementDateRange,
  today: string,
): boolean {
  return getAnnouncementStatus(item, today) === "active";
}

export function buildVisibleAnnouncementsQuery(today: string): {
  sql: string;
  values: string[];
} {
  return {
    sql: `SELECT id, title, body
            FROM announcements
           WHERE is_active = 1 AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
           ORDER BY created_at DESC, id DESC LIMIT 3`,
    values: [today, today],
  };
}

function containsMarkup(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value) || /<\s*script\b/i.test(value);
}

function normalizeBody(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function validateAnnouncementInput(
  input: AnnouncementInput,
): AnnouncementValidationResult {
  const title = input.title.trim();
  const body = normalizeBody(input.body);
  if (!title || !isValidCalendarDate(input.startDate)) {
    return { ok: false, error: "required" };
  }
  if ([...title].length > 200) return { ok: false, error: "title_length" };
  if ([...body].length > 1000) return { ok: false, error: "body_length" };
  if (containsMarkup(title) || containsMarkup(body)) {
    return { ok: false, error: "markup" };
  }
  if (/[\u0000-\u0009\u000B-\u001F\u007F]/.test(title) || /[\u0000-\u0009\u000B-\u001F\u007F]/.test(body)) {
    return { ok: false, error: "control" };
  }

  const endDate = typeof input.endDate === "string" ? input.endDate.trim() : "";
  if (endDate && !isValidCalendarDate(endDate)) {
    return { ok: false, error: "date" };
  }
  if (endDate && endDate < input.startDate) {
    return { ok: false, error: "order" };
  }
  return {
    ok: true,
    value: {
      title,
      body,
      startDate: input.startDate,
      endDate: endDate || null,
      isActive: input.isActive ? 1 : 0,
    },
  };
}

export function formatAnnouncementPeriod(
  item: AnnouncementDateRange,
  noEndLabel: string,
): string {
  const start = formatThaiShortDate(item.startDate) ?? item.startDate;
  const end = item.endDate === null ? noEndLabel : formatThaiShortDate(item.endDate) ?? item.endDate;
  return `${start} – ${end}`;
}

export interface AnnouncementFilters {
  q: string;
  status: AnnouncementStatus | "all";
  page: number;
}

export function parseAnnouncementFilters(
  input: Record<string, string | null | undefined>,
): AnnouncementFilters {
  const statuses: AnnouncementStatus[] = ["active", "upcoming", "expired", "inactive"];
  const rawStatus = input.status ?? "all";
  const pageValue = input.page ?? "1";
  const pageNumber = /^\d+$/.test(pageValue) ? Number(pageValue) : 1;
  return {
    q: (input.q ?? "").slice(0, 100),
    status: statuses.find((status) => status === rawStatus) ?? "all",
    page: Number.isSafeInteger(pageNumber) && pageNumber > 0 ? Math.min(pageNumber, 100000) : 1,
  };
}
