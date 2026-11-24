import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Image as ImageIcon,
} from "lucide-react";
import {
  formatFiscalQuarterMonths,
  formatPlannedDateMonth,
  formatPlannedDateRange,
  getActivityTypePresentation,
} from "@/lib/admin-dashboard-metrics";
import type {
  AdminDashboardData,
  DashboardOptions,
} from "@/lib/admin-dashboard-data";
import { formatContent, type SiteContent } from "@/lib/content";

interface AdminDashboardProps {
  content: SiteContent;
  data: AdminDashboardData;
  options: DashboardOptions;
}

const numberFormatter = new Intl.NumberFormat("th-TH");
const decimalFormatter = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

function getPeriodLabel(
  content: SiteContent,
  fiscalYear: number,
  quarterNo: number,
): string {
  return formatContent(content["dashboard.period.label"], {
    quarter: quarterNo,
    fiscalYear,
    range: formatFiscalQuarterMonths({ fiscalYear, quarterNo }),
  });
}

function Delta({
  value,
  description,
  unit = "",
  percentage = false,
  decimal = false,
}: {
  value: number;
  description: string;
  unit?: string;
  percentage?: boolean;
  decimal?: boolean;
}) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const formattedValue = percentage
    ? `${formatDecimal(Math.abs(value))}%`
    : `${
        decimal
          ? formatDecimal(Math.abs(value))
          : formatNumber(Math.abs(value))
      }${unit}`;
  const Icon = isNegative ? ArrowDownRight : ArrowUpRight;
  const sign = isPositive ? "+" : isNegative ? "−" : "";

  return (
    <p
      className={`dashboard-delta ${
        isPositive
          ? "dashboard-delta-positive"
          : isNegative
            ? "dashboard-delta-negative"
            : "dashboard-delta-neutral"
      }`}
    >
      {value !== 0 ? <Icon aria-hidden="true" size={15} /> : null}
      <strong>
        {sign}
        {formattedValue}
      </strong>
      <span>{description}</span>
    </p>
  );
}

function StatCard({
  title,
  value,
  unit,
  supportingText,
  delta,
}: {
  title: string;
  value: string;
  unit?: string;
  supportingText?: string;
  delta?: {
    value: number;
    description: string;
    unit?: string;
    percentage?: boolean;
    decimal?: boolean;
  };
}) {
  return (
    <section className="dashboard-stat-card">
      <h2>{title}</h2>
      <p className="dashboard-stat-value">
        <strong>{value}</strong>
        {unit ? <span>{unit}</span> : null}
      </p>
      {supportingText ? (
        <p className="dashboard-stat-support">{supportingText}</p>
      ) : null}
      {delta ? (
        <Delta
          description={delta.description}
          percentage={delta.percentage}
          decimal={delta.decimal}
          unit={delta.unit}
          value={delta.value}
        />
      ) : null}
    </section>
  );
}

function DashboardFilters({
  content,
  data,
  options,
}: AdminDashboardProps) {
  return (
    <form className="dashboard-filters" method="get">
      <label>
        <span>{content["dashboard.filter.fiscal_year"]}</span>
        <select
          defaultValue={String(data.filters.fiscalYear)}
          name="fiscal_year"
        >
          {options.fiscalYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{content["dashboard.filter.quarter"]}</span>
        <select defaultValue={String(data.filters.quarterNo)} name="quarter">
          {options.quarters.map((quarter) => (
            <option key={quarter.no} value={quarter.no}>
              {quarter.label_th}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{content["dashboard.filter.department"]}</span>
        <select
          defaultValue={data.filters.departmentCode ?? ""}
          name="department"
        >
          <option value="">{content["dashboard.filter.all"]}</option>
          {options.activeDepartments.map((department) => (
            <option key={department.code} value={department.code}>
              {department.code} — {department.name_th}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{content["dashboard.filter.activity_type"]}</span>
        <select
          defaultValue={data.filters.activityTypeId?.toString() ?? ""}
          name="activity_type"
        >
          <option value="">{content["dashboard.filter.all"]}</option>
          {options.activeActivityTypes.map((activityType) => (
            <option key={activityType.id} value={activityType.id}>
              {activityType.name_th}
            </option>
          ))}
        </select>
      </label>
      <button className="dashboard-filter-submit" type="submit">
        {content["dashboard.filter.apply"]}
      </button>
    </form>
  );
}

function DepartmentStatus({
  content,
  data,
  options,
}: AdminDashboardProps) {
  const submittedCount = data.submittedDepartmentCodes.length;
  return (
    <aside className="dashboard-submission">
      <p>
        {formatContent(content["dashboard.submission.summary"], {
          submitted: formatNumber(submittedCount),
          total: formatNumber(data.activeDepartmentCount),
        })}
      </p>
      <div className="dashboard-department-statuses">
        {options.activeDepartments.map((department) => {
          const submitted = data.submittedDepartmentCodes.includes(
            department.code,
          );
          return (
            <span
              className={
                submitted
                  ? "dashboard-status-pill dashboard-status-sent"
                  : "dashboard-status-pill dashboard-status-pending"
              }
              key={department.code}
              title={
                submitted
                  ? content["dashboard.submission.sent"]
                  : content["dashboard.submission.pending"]
              }
            >
              {department.code}
            </span>
          );
        })}
      </div>
    </aside>
  );
}

function DepartmentChart({
  content,
  data,
  selectedDepartment,
}: {
  content: SiteContent;
  data: AdminDashboardData;
  selectedDepartment: string | null;
}) {
  const maxCount = Math.max(
    1,
    ...data.departmentCounts.map((department) => department.activityCount),
  );
  return (
    <section className="dashboard-chart-card">
      <header className="dashboard-chart-heading">
        <h2>{content["dashboard.chart.department.title"]}</h2>
        <p>
          {formatContent(content["dashboard.chart.department.subtitle"], {
            affiliations: formatNumber(data.departmentAffiliations),
            activities: formatNumber(data.departmentChartActivityCount),
          })}
        </p>
      </header>
      {data.departmentChartActivityCount === 0 ? (
        <p className="dashboard-empty">{content["dashboard.chart.empty"]}</p>
      ) : (
        <div className="dashboard-horizontal-chart">
          {data.departmentCounts.map((department) => (
            <div className="dashboard-bar-row" key={department.code}>
              <span
                className="dashboard-bar-label"
                title={department.name}
              >
                {department.code}
              </span>
              <div className="dashboard-bar-track">
                <span
                  className={
                    department.code === selectedDepartment
                      ? "dashboard-bar dashboard-bar-selected"
                      : "dashboard-bar"
                  }
                  style={{
                    width: `${(department.activityCount / maxCount) * 100}%`,
                  }}
                  title={department.name}
                />
              </div>
              <strong>{formatNumber(department.activityCount)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityTypeChart({
  content,
  data,
  options,
}: {
  content: SiteContent;
  data: AdminDashboardData;
  options: DashboardOptions;
}) {
  const total = data.current.activityCount;
  const circumference = 2 * Math.PI * 52;
  const typeNames = new Map(
    options.activityTypes.map((activityType) => [
      activityType.id,
      activityType.name_th,
    ]),
  );
  const categories = data.activityTypeCounts.map((entry) => ({
    ...entry,
    ...getActivityTypePresentation(
      entry.id,
      typeNames.get(entry.id) ?? "",
    ),
  }));
  const nonEmptyCategories = categories.filter(
    (category) => category.activityCount > 0,
  );
  return (
    <section className="dashboard-chart-card">
      <header className="dashboard-chart-heading">
        <h2>{content["dashboard.chart.activity_type.title"]}</h2>
        <p>{content["dashboard.chart.activity_type.subtitle"]}</p>
      </header>
      <div className="dashboard-donut-layout">
        <div className="dashboard-donut-wrap">
          {total === 0 ? (
            <p className="dashboard-empty">
              {content["dashboard.chart.empty"]}
            </p>
          ) : (
            <svg
              aria-label={content["dashboard.chart.activity_type.title"]}
              className="dashboard-donut"
              role="img"
              width="100%"
              viewBox="0 0 140 140"
            >
              <circle
                cx="70"
                cy="70"
                fill="none"
                r="52"
                stroke="#edf1f6"
                strokeWidth="22"
              />
              {nonEmptyCategories.map((category, index) => {
                  const length =
                    (category.activityCount / total) * circumference;
                  const offset = nonEmptyCategories
                    .slice(0, index)
                    .reduce(
                      (consumed, previous) =>
                        consumed +
                        (previous.activityCount / total) * circumference,
                      0,
                    );
                  return (
                    <circle
                      cx="70"
                      cy="70"
                      fill="none"
                      key={category.id}
                      r="52"
                      stroke={category.color}
                      strokeDasharray={`${length} ${circumference}`}
                      strokeDashoffset={-offset}
                      strokeWidth="22"
                      transform="rotate(-90 70 70)"
                    />
                  );
                })}
              <text
                className="dashboard-donut-total"
                dominantBaseline="middle"
                fill="#263d57"
                fontSize={19}
                fontWeight={700}
                textAnchor="middle"
                x="70"
                y="65"
              >
                {formatNumber(total)}
              </text>
              <text
                className="dashboard-donut-label"
                dominantBaseline="middle"
                fill="#7c8998"
                fontSize={9}
                textAnchor="middle"
                x="70"
                y="86"
              >
                {content["dashboard.stat.activities.unit"]}
              </text>
            </svg>
          )}
        </div>
        <ul className="dashboard-donut-legend">
          {categories.map((category) => {
            const percentage =
              total === 0 ? 0 : (category.activityCount / total) * 100;
            return (
              <li key={category.id}>
                <span
                  aria-hidden="true"
                  className="dashboard-legend-dot"
                  style={{ backgroundColor: category.color }}
                />
                <span className="dashboard-legend-name">
                  {category.shortName}
                </span>
                <span>{formatDecimal(percentage)}%</span>
                <strong>{formatNumber(category.activityCount)}</strong>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function ParticipantTypeChart({
  content,
  data,
  options,
}: {
  content: SiteContent;
  data: AdminDashboardData;
  options: DashboardOptions;
}) {
  const countById = new Map(
    data.participantTypeCounts.map((entry) => [
      entry.id,
      entry.activityCount,
    ]),
  );
  const categories = options.participantTypes.map((participantType) => ({
    ...participantType,
    activityCount: countById.get(participantType.id) ?? 0,
  }));
  const maxCount = Math.max(
    1,
    ...categories.map((category) => category.activityCount),
  );
  return (
    <section className="dashboard-chart-card">
      <header className="dashboard-chart-heading">
        <h2>{content["dashboard.chart.participant_type.title"]}</h2>
        <p>{content["dashboard.chart.participant_type.subtitle"]}</p>
      </header>
      {data.current.activityCount === 0 ? (
        <p className="dashboard-empty">{content["dashboard.chart.empty"]}</p>
      ) : (
        <div className="dashboard-horizontal-chart">
          {categories.map((category) => (
            <div className="dashboard-bar-row" key={category.id}>
              <span className="dashboard-bar-label" title={category.name_th}>
                {category.name_th}
              </span>
              <div className="dashboard-bar-track">
                <span
                  className="dashboard-bar dashboard-bar-teal"
                  style={{
                    width: `${(category.activityCount / maxCount) * 100}%`,
                  }}
                />
              </div>
              <strong>{formatNumber(category.activityCount)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TrendChart({
  content,
  data,
  options,
}: {
  content: SiteContent;
  data: AdminDashboardData;
  options: DashboardOptions;
}) {
  const baseline = 174;
  const maxHeight = 120;
  const maxActivities = Math.max(
    1,
    ...data.trends.map((quarter) => quarter.activityCount),
  );
  const maxParticipants = Math.max(
    1,
    ...data.trends.map((quarter) => quarter.participants),
  );
  const points = data.trends.map((quarter, index) => {
    const x = 70 + index * 112;
    const height =
      (quarter.activityCount / maxActivities) * maxHeight;
    const activityLabelY = baseline - height - 8;
    const y =
      baseline - (quarter.participants / maxParticipants) * maxHeight;
    return { ...quarter, x, y, activityLabelY };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const hasData = data.trends.some(
    (quarter) => quarter.activityCount > 0 || quarter.participants > 0,
  );
  const labels = new Map(
    options.quarters.map((quarter) => [
      quarter.no,
      {
        short: formatContent(content["dashboard.quarter.name"], {
          quarter: quarter.no,
        }),
        full: quarter.label_th,
      },
    ]),
  );

  return (
    <section className="dashboard-chart-card">
      <header className="dashboard-chart-heading">
        <h2>{content["dashboard.chart.trend.title"]}</h2>
        <p>{content["dashboard.chart.trend.subtitle"]}</p>
      </header>
      {!hasData ? (
        <p className="dashboard-empty">{content["dashboard.chart.empty"]}</p>
      ) : (
        <>
          <svg
            aria-label={content["dashboard.chart.trend.title"]}
            className="dashboard-trend-chart"
            role="img"
            width="100%"
            viewBox="0 0 500 230"
          >
            {[0, 1, 2].map((line) => (
              <line
                key={line}
                stroke="#e9eef4"
                x1="30"
                x2="475"
                y1={54 + line * 60}
                y2={54 + line * 60}
              />
            ))}
            {points.map((point) => {
              const height =
                (point.activityCount / maxActivities) * maxHeight;
              const top = baseline - height;
              const quarterLabel = labels.get(point.quarterNo);
              return (
                <g key={point.quarterNo}>
                  <title>{quarterLabel?.full}</title>
                  <rect
                    fill={
                      point.quarterNo === data.filters.quarterNo
                        ? "#1E5FAF"
                        : "#B8D0EA"
                    }
                    height={height}
                    rx="5"
                    width="40"
                    x={point.x - 20}
                    y={top}
                  />
                  <text
                    className="dashboard-chart-value"
                    fontSize={10}
                    textAnchor="middle"
                    x={point.x}
                    y={point.activityLabelY}
                  >
                    {formatNumber(point.activityCount)}
                  </text>
                  <text
                    className="dashboard-chart-axis-label"
                    fontSize={10}
                    textAnchor="middle"
                    x={point.x}
                    y="202"
                  >
                    {quarterLabel?.short ?? point.quarterNo}
                  </text>
                </g>
              );
            })}
            <polyline
              fill="none"
              points={linePoints}
              stroke="#17957F"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            {points.map((point) => (
              <g key={`participant-${point.quarterNo}`}>
                <circle cx={point.x} cy={point.y} fill="#17957F" r="4.5" />
                <text
                  className="dashboard-chart-value dashboard-chart-value-teal"
                  fontSize={10}
                  textAnchor="middle"
                  x={point.x}
                  y={
                    Math.abs(point.activityLabelY - (point.y - 12)) < 14
                      ? Math.min(baseline + 15, point.y + 15)
                      : Math.max(42, point.y - 12)
                  }
                >
                  {formatNumber(point.participants)}
                </text>
              </g>
            ))}
          </svg>
          <div className="dashboard-trend-legend">
            <span>
              <i className="dashboard-trend-legend-bar" />
              {content["dashboard.chart.trend.activities"]}
            </span>
            <span>
              <i className="dashboard-trend-legend-line" />
              {content["dashboard.chart.trend.participants"]}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function FeaturedActivities({
  content,
  data,
  options,
}: {
  content: SiteContent;
  data: AdminDashboardData;
  options: DashboardOptions;
}) {
  const activityTypeNames = new Map(
    options.activityTypes.map((activityType) => [
      activityType.id,
      activityType.name_th,
    ]),
  );
  return (
    <section className="dashboard-featured-section">
      <h2 className="dashboard-section-title">
        {content["dashboard.featured.title"]}
      </h2>
      {data.featuredActivities.length === 0 ? (
        <p className="dashboard-empty dashboard-featured-empty">
          {content["dashboard.chart.empty"]}
        </p>
      ) : (
        <div className="dashboard-featured-grid">
          {data.featuredActivities.map((activity) => {
            const type = getActivityTypePresentation(
              activity.activityTypeId,
              activityTypeNames.get(activity.activityTypeId) ?? "",
            );
            return (
              <article
                className="dashboard-featured-card"
                key={activity.id}
              >
                <div className="dashboard-featured-image">
                  {activity.firstImageId ? (
                    <Image
                      alt={activity.title}
                      fill
                      sizes="(max-width: 760px) 40vw, (max-width: 1240px) 25vw, 320px"
                      src={`/api/activities/past/images/${activity.firstImageId}`}
                      unoptimized
                    />
                  ) : (
                    <div className="dashboard-image-placeholder">
                      <ImageIcon aria-hidden="true" size={26} />
                      <span>{content["dashboard.featured.no_image"]}</span>
                    </div>
                  )}
                </div>
                <div className="dashboard-featured-copy">
                  <h3>{activity.title}</h3>
                  <div className="dashboard-featured-tags">
                    <span
                      className="dashboard-type-tag"
                      style={{
                        backgroundColor: `${type.color}18`,
                        color: type.color,
                      }}
                    >
                      {type.shortName}
                    </span>
                    <span className="dashboard-department-tag">
                      {[activity.mainDepartment, ...activity.coOrganizers].join(
                        " + ",
                      )}
                    </span>
                  </div>
                  <p className="dashboard-featured-participants">
                    <strong>{formatNumber(activity.totalParticipants)}</strong>
                    <span>{content["dashboard.featured.people"]}</span>
                    {activity.satisfactionPercent !== null ? (
                      <span className="dashboard-featured-satisfaction">
                        {formatContent(
                          content["dashboard.featured.satisfaction"],
                          {
                            value: formatDecimal(
                              activity.satisfactionPercent,
                            ),
                          },
                        )}
                      </span>
                    ) : null}
                  </p>
                  {activity.resultSummary ? (
                    <p className="dashboard-result-summary">
                      {activity.resultSummary}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PlannedActivities({
  content,
  data,
  options,
}: {
  content: SiteContent;
  data: AdminDashboardData;
  options: DashboardOptions;
}) {
  const period = formatFiscalQuarterMonths(data.planQuarter);
  const summary = formatContent(content["dashboard.planned.summary"], {
    count: formatNumber(data.plannedSummary.activityCount),
    confirmed: formatNumber(data.plannedSummary.confirmedCount),
    people: formatNumber(data.plannedSummary.expectedParticipants),
  });
  const activityTypeNames = new Map(
    options.activityTypes.map((activityType) => [
      activityType.id,
      activityType.name_th,
    ]),
  );

  return (
    <section className="dashboard-planned-section">
      <header className="dashboard-planned-heading">
        <h2>
          {formatContent(content["dashboard.planned.title"], {
            range: period,
          })}
        </h2>
        <p>{summary}</p>
        <Link
          className="dashboard-planned-view-all"
          href={`/admin/activities?status=planned&fy=${data.planQuarter.fiscalYear}&quarter=${data.planQuarter.quarterNo}`}
        >
          {content["dashboard.planned.view_all"]}
        </Link>
      </header>
      {data.plannedActivities.length === 0 ? (
        <p className="dashboard-empty">
          {content["dashboard.planned.empty"]}
        </p>
      ) : (
        <div className="dashboard-planned-table-wrap">
          <table className="dashboard-planned-table">
            <thead>
              <tr>
                <th>{content["dashboard.planned.date"]}</th>
                <th>{content["dashboard.planned.activity"]}</th>
                <th>{content["dashboard.planned.department"]}</th>
                <th>{content["dashboard.planned.type"]}</th>
                <th>{content["dashboard.planned.people"]}</th>
                <th>{content["dashboard.planned.status"]}</th>
              </tr>
            </thead>
            <tbody>
              {data.plannedActivities.map((activity) => {
                const confirmed = activity.dateStatus === "confirmed";
                const type = getActivityTypePresentation(
                  activity.activityTypeId,
                  activityTypeNames.get(activity.activityTypeId) ?? "",
                );
                const date = confirmed
                  ? formatPlannedDateRange(
                      activity.expectedStart,
                      activity.expectedEnd,
                    )
                  : `${formatPlannedDateMonth(activity.expectedStart)} ${content["dashboard.planned.awaiting"]}`;
                return (
                  <tr key={activity.id}>
                    <td data-label={content["dashboard.planned.date"]}>
                      {date}
                    </td>
                    <td
                      className="dashboard-planned-title"
                      data-label={content["dashboard.planned.activity"]}
                    >
                      {activity.title}
                    </td>
                    <td data-label={content["dashboard.planned.department"]}>
                      <span className="dashboard-planned-department">
                        {activity.mainDepartment}
                      </span>
                    </td>
                    <td data-label={content["dashboard.planned.type"]}>
                      <span
                        className="dashboard-type-tag"
                        style={{
                          backgroundColor: `${type.color}18`,
                          color: type.color,
                        }}
                      >
                        {type.shortName}
                      </span>
                    </td>
                    <td data-label={content["dashboard.planned.people"]}>
                      {formatNumber(activity.expectedParticipants)}
                    </td>
                    <td data-label={content["dashboard.planned.status"]}>
                      <span
                        className={
                          confirmed
                            ? "dashboard-plan-status dashboard-plan-confirmed"
                            : "dashboard-plan-status dashboard-plan-unconfirmed"
                        }
                      >
                        {confirmed
                          ? content["dashboard.planned.confirmed"]
                          : content["dashboard.planned.unconfirmed"]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AdminDashboard({
  content,
  data,
  options,
}: AdminDashboardProps) {
  const previous = data.previous;
  const previousQuarterName = previous
    ? formatContent(content["dashboard.quarter.name"], {
        quarter: data.previousQuarter.quarterNo,
      })
    : "";
  const activityDelta =
    previous && previous.activityCount > 0
      ? {
          value: data.current.activityCount - previous.activityCount,
          description: formatContent(
            content["dashboard.stat.activities.delta"],
            {
              quarter: previousQuarterName,
              count: formatNumber(previous.activityCount),
            },
          ),
          unit: "",
        }
      : undefined;
  const participantDelta =
    previous && previous.participants > 0
      ? {
          value:
            ((data.current.participants - previous.participants) /
              previous.participants) *
            100,
          description: formatContent(
            content["dashboard.stat.participants.delta"],
            {
              quarter: previousQuarterName,
              count: formatNumber(previous.participants),
            },
          ),
          percentage: true,
        }
      : undefined;
  const currentSatisfaction = data.current.satisfactionAverage;
  const satisfactionDelta =
    previous?.satisfactionAverage !== null &&
    previous?.satisfactionAverage !== undefined &&
    currentSatisfaction !== null
      ? {
          value:
            currentSatisfaction - previous.satisfactionAverage,
          description: formatContent(
            content["dashboard.stat.satisfaction.delta"],
            {
              quarter: previousQuarterName,
              count: formatNumber(previous.satisfactionCount),
            },
          ),
          unit: ` ${content["dashboard.stat.satisfaction.points"]}`,
          decimal: true,
        }
      : undefined;
  const description = formatContent(content["dashboard.description"], {
    pastQuarter: getPeriodLabel(
      content,
      data.filters.fiscalYear,
      data.filters.quarterNo,
    ),
    planQuarter: getPeriodLabel(
      content,
      data.planQuarter.fiscalYear,
      data.planQuarter.quarterNo,
    ),
  });
  const satisfactionSupportingText = formatContent(
    content["dashboard.stat.satisfaction.evaluated"],
    {
      count: formatNumber(data.current.satisfactionCount),
      total: formatNumber(data.current.activityCount),
    },
  );

  return (
    <div className="admin-dashboard-page">
      <section className="dashboard-intro-card">
        <div className="dashboard-intro-copy">
          <h1>{content["dashboard.title"]}</h1>
          <p>{description}</p>
        </div>
        <DepartmentStatus content={content} data={data} options={options} />
        <DashboardFilters content={content} data={data} options={options} />
      </section>

      <div className="dashboard-stat-grid">
        <StatCard
          delta={activityDelta}
          title={content["dashboard.stat.activities.title"]}
          unit={content["dashboard.stat.activities.unit"]}
          value={formatNumber(data.current.activityCount)}
        />
        <StatCard
          delta={participantDelta}
          title={content["dashboard.stat.participants.title"]}
          unit={content["dashboard.stat.participants.unit"]}
          value={formatNumber(data.current.participants)}
        />
        <StatCard
          delta={satisfactionDelta}
          supportingText={satisfactionSupportingText}
          title={content["dashboard.stat.satisfaction.title"]}
          value={
            currentSatisfaction === null
              ? "–"
              : formatDecimal(currentSatisfaction)
          }
          unit={currentSatisfaction === null ? undefined : "%"}
        />
      </div>

      <div className="dashboard-chart-grid">
        <DepartmentChart
          content={content}
          data={data}
          selectedDepartment={data.filters.departmentCode}
        />
        <ActivityTypeChart content={content} data={data} options={options} />
        <ParticipantTypeChart
          content={content}
          data={data}
          options={options}
        />
        <TrendChart content={content} data={data} options={options} />
      </div>

      <div className="dashboard-lower-grid">
        <FeaturedActivities content={content} data={data} options={options} />
        <PlannedActivities content={content} data={data} options={options} />
      </div>

      <footer className="dashboard-source">{content["dashboard.source"]}</footer>
    </div>
  );
}
