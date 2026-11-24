export interface FiscalQuarter {
  fiscalYear: number;
  quarterNo: number;
}

export interface DepartmentSummary {
  code: string;
  name_th: string;
  sort_no: number;
  activity_count: number;
}

export interface DepartmentCountRow {
  department_code: string;
  activity_count: number | string;
}

export interface FeaturedActivityOrder {
  id: number | string;
  satisfaction_percent: number | string | null;
  total_participants: number | string;
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

const ACTIVITY_TYPE_PRESENTATION: Record<
  number,
  { shortName: string; color: string }
> = {
  1: { shortName: "อบรม/สัมมนา", color: "#1E5FAF" },
  2: { shortName: "ภารกิจหลัก", color: "#17957F" },
  3: { shortName: "เครือข่าย", color: "#DB8F1F" },
  4: { shortName: "ต้อนรับเยี่ยมชม", color: "#7967C0" },
  5: { shortName: "พัฒนาบุคลากร", color: "#C94F6D" },
  6: { shortName: "อื่นๆ", color: "#8E99AB" },
};

function assertQuarter(quarter: FiscalQuarter): void {
  if (
    !Number.isInteger(quarter.fiscalYear) ||
    !Number.isInteger(quarter.quarterNo) ||
    quarter.quarterNo < 1 ||
    quarter.quarterNo > 4
  ) {
    throw new RangeError("Invalid fiscal quarter.");
  }
}

function numericValue(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericId(value: number | string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function getPreviousFiscalQuarter(
  quarter: FiscalQuarter,
): FiscalQuarter {
  assertQuarter(quarter);
  return quarter.quarterNo === 1
    ? { fiscalYear: quarter.fiscalYear - 1, quarterNo: 4 }
    : { fiscalYear: quarter.fiscalYear, quarterNo: quarter.quarterNo - 1 };
}

export function getNextFiscalQuarter(
  quarter: FiscalQuarter,
): FiscalQuarter {
  assertQuarter(quarter);
  return quarter.quarterNo === 4
    ? { fiscalYear: quarter.fiscalYear + 1, quarterNo: 1 }
    : { fiscalYear: quarter.fiscalYear, quarterNo: quarter.quarterNo + 1 };
}

export function calculateAverageSatisfaction(
  satisfactionSum: number | string,
  evaluatedCount: number | string,
): number | null {
  const count = numericValue(evaluatedCount);
  if (count <= 0) return null;
  return numericValue(satisfactionSum) / count;
}

export function mergeDepartmentActivityCounts(
  departments: readonly Omit<DepartmentSummary, "activity_count">[],
  mainCounts: readonly DepartmentCountRow[],
  coOrganizerCounts: readonly DepartmentCountRow[],
): DepartmentSummary[] {
  const counts = new Map<string, number>();
  for (const department of departments) {
    counts.set(department.code, 0);
  }
  for (const row of [...mainCounts, ...coOrganizerCounts]) {
    if (counts.has(row.department_code)) {
      counts.set(
        row.department_code,
        (counts.get(row.department_code) ?? 0) +
          numericValue(row.activity_count),
      );
    }
  }
  return departments
    .map((department) => ({
      ...department,
      activity_count: counts.get(department.code) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.activity_count - left.activity_count ||
        left.sort_no - right.sort_no ||
        left.code.localeCompare(right.code),
    );
}

export function sortFeaturedActivities<
  T extends FeaturedActivityOrder,
>(activities: readonly T[]): T[] {
  return [...activities].sort((left, right) => {
    const leftSatisfaction =
      left.satisfaction_percent === null
        ? null
        : numericValue(left.satisfaction_percent);
    const rightSatisfaction =
      right.satisfaction_percent === null
        ? null
        : numericValue(right.satisfaction_percent);
    if (leftSatisfaction === null && rightSatisfaction !== null) return 1;
    if (leftSatisfaction !== null && rightSatisfaction === null) return -1;
    if (
      leftSatisfaction !== null &&
      rightSatisfaction !== null &&
      leftSatisfaction !== rightSatisfaction
    ) {
      return rightSatisfaction - leftSatisfaction;
    }

    const participantDifference =
      numericValue(right.total_participants) -
      numericValue(left.total_participants);
    if (participantDifference !== 0) return participantDifference;

    const leftId = numericId(left.id);
    const rightId = numericId(right.id);
    if (leftId !== null && rightId !== null) {
      return leftId > rightId ? -1 : leftId < rightId ? 1 : 0;
    }
    return String(right.id).localeCompare(String(left.id));
  });
}

export function getActivityTypePresentation(
  id: number,
  name: string,
): { shortName: string; color: string } {
  return ACTIVITY_TYPE_PRESENTATION[id] ?? {
    shortName: name,
    color: "#8E99AB",
  };
}

export function formatFiscalQuarterMonths(
  quarter: FiscalQuarter,
): string {
  assertQuarter(quarter);
  const quarterMonths: Record<number, [number, number]> = {
    1: [10, 12],
    2: [1, 3],
    3: [4, 6],
    4: [7, 9],
  };
  const [startMonth, endMonth] = quarterMonths[quarter.quarterNo];
  const calendarYear =
    quarter.quarterNo === 1
      ? quarter.fiscalYear - 1
      : quarter.fiscalYear;
  return `${MONTH_NAMES_TH[startMonth]} – ${MONTH_NAMES_TH[endMonth]} ${calendarYear}`;
}

function parseIsoDate(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError("Invalid ISO date.");
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function formatPlannedDateRange(
  startDate: string,
  endDate: string,
): string {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const startDay = start.day;
  const endDay = end.day;
  const startMonth = MONTH_NAMES_TH[start.month];
  const endMonth = MONTH_NAMES_TH[end.month];
  const startYear = start.year + 543;
  const endYear = end.year + 543;

  if (start.year === end.year && start.month === end.month) {
    return `${startDay}–${endDay} ${startMonth}`;
  }
  if (start.year === end.year) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
  }
  return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
}

export function formatPlannedDateMonth(date: string): string {
  const parsed = parseIsoDate(date);
  return MONTH_NAMES_TH[parsed.month];
}
