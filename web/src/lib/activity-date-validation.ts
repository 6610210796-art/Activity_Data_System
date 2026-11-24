export type ActivityDateField =
  | "start_date"
  | "end_date"
  | "expected_start"
  | "expected_end";

export type ActivityDateErrorKey =
  | "err.required"
  | "err.date.quarter"
  | "err.date.future"
  | "err.date.planned_future"
  | "err.date.order";

export interface ActivityDateError<
  TField extends ActivityDateField = ActivityDateField,
> {
  field: TField;
  key: ActivityDateErrorKey;
}

export interface ActivityDateInput<
  TStartField extends ActivityDateField = ActivityDateField,
  TEndField extends ActivityDateField = ActivityDateField,
> {
  fiscalYear: number;
  quarterNo: number;
  startDate: string;
  endDate: string;
  startField: TStartField;
  endField: TEndField;
  startRule: "not_after_today" | "not_before_today" | "none";
  today?: string;
}

export interface QuarterDateRange {
  start: string;
  end: string;
}

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

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear =
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export function getQuarterDateRange(
  fiscalYear: number,
  quarterNo: number,
): QuarterDateRange | null {
  if (
    !Number.isInteger(fiscalYear) ||
    fiscalYear < 1544 ||
    fiscalYear > 9999 ||
    !Number.isInteger(quarterNo) ||
    quarterNo < 1 ||
    quarterNo > 4
  ) {
    return null;
  }

  const year = quarterNo === 1 ? fiscalYear - 544 : fiscalYear - 543;
  const startMonth = [10, 1, 4, 7][quarterNo - 1];
  const endMonth = startMonth + 2;
  const endYear = endMonth > 12 ? year + 1 : year;
  const normalizedEndMonth = endMonth > 12 ? endMonth - 12 : endMonth;

  return {
    start: formatDate(year, startMonth, 1),
    end: formatDate(
      endYear,
      normalizedEndMonth,
      daysInMonth(endYear, normalizedEndMonth),
    ),
  };
}

export function getBangkokToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return formatDate(year, month, day);
}

export function validateActivityDates<
  TStartField extends ActivityDateField,
  TEndField extends ActivityDateField,
>(
  input: ActivityDateInput<TStartField, TEndField>,
): ActivityDateError<TStartField | TEndField> | null {
  if (!isValidDate(input.startDate)) {
    return { field: input.startField, key: "err.required" };
  }
  if (!isValidDate(input.endDate)) {
    return { field: input.endField, key: "err.required" };
  }

  const range = getQuarterDateRange(input.fiscalYear, input.quarterNo);
  if (
    !range ||
    input.startDate < range.start ||
    input.startDate > range.end
  ) {
    return { field: input.startField, key: "err.date.quarter" };
  }
  if (input.endDate < range.start || input.endDate > range.end) {
    return { field: input.endField, key: "err.date.quarter" };
  }

  const today = input.today ?? getBangkokToday();
  if (input.startRule === "not_after_today" && input.startDate > today) {
    return { field: input.startField, key: "err.date.future" };
  }
  if (input.startRule === "not_before_today" && input.startDate < today) {
    return { field: input.startField, key: "err.date.planned_future" };
  }
  if (input.endDate < input.startDate) {
    return { field: input.endField, key: "err.date.order" };
  }
  return null;
}

export function getVisibleActivityDateError<
  TStartField extends ActivityDateField,
  TEndField extends ActivityDateField,
>(
  input: ActivityDateInput<TStartField, TEndField>,
  touched: Partial<Record<TStartField | TEndField, boolean>>,
): ActivityDateError<TStartField | TEndField> | null {
  const error = validateActivityDates(input);
  return error && touched[error.field] ? error : null;
}

function formatThaiDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${MONTH_NAMES_TH[month]} ${year + 543}`;
}

function formatGregorianDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${pad(day)}/${pad(month)}/${year}`;
}

export function formatBuddhistCalendarDate(value: string): string | null {
  return isValidDate(value) ? formatThaiDate(value) : null;
}

export function getDateInputYear(value: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return match ? Number(match[1]) : null;
}

export function formatQuarterDateRangeMessage(
  template: string,
  fiscalYear: number,
  quarterNo: number,
): string {
  const range = getQuarterDateRange(fiscalYear, quarterNo);
  if (!range) return "";
  const buddhistRange = `${formatThaiDate(range.start)} – ${formatThaiDate(range.end)}`;
  const gregorianRange = `${formatGregorianDate(range.start)} – ${formatGregorianDate(range.end)}`;
  return template
    .replace(/\{beRange\}/g, buddhistRange)
    .replace(/\{adRange\}/g, gregorianRange);
}

export function formatQuarterDateError(
  message: string,
  fiscalYear: number,
  quarterNo: number,
  rangeTemplate?: string,
): string {
  let rangeMessage = "";
  if (rangeTemplate) {
    rangeMessage = formatQuarterDateRangeMessage(
      rangeTemplate,
      fiscalYear,
      quarterNo,
    );
  } else {
    const range = getQuarterDateRange(fiscalYear, quarterNo);
    if (range) {
      rangeMessage = `ไตรมาสนี้คือ ${formatThaiDate(range.start)} – ${formatThaiDate(range.end)}`;
    }
  }
  return rangeMessage ? `${message} (${rangeMessage})` : message;
}
