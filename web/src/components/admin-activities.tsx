"use client";

import Link from "next/link";
import {
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { useState } from "react";
import type { SiteContent } from "@/lib/content";
import type {
  AdminActivitiesOptions,
  AdminActivitiesPageData,
} from "@/lib/admin-activities-data";
import type { AdminActivitiesFilters } from "@/lib/admin-activities-query";

interface Props {
  content: SiteContent;
  data: AdminActivitiesPageData;
  filters: AdminActivitiesFilters;
  options: AdminActivitiesOptions;
}

const monthThai = [
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

function formatThaiDate(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return `${day} ${monthThai[month]} ${year + 543}`;
}

function formatThaiRange(start: string, end: string): string {
  if (!start) return "";
  if (!end || start === end) return formatThaiDate(start);
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay}–${endDay} ${monthThai[endMonth]} ${endYear + 543}`;
  }
  return `${formatThaiDate(start)} – ${formatThaiDate(end)}`;
}

function formatQuarter(
  quarterNo: number,
  fiscalYear: number,
  labels: AdminActivitiesOptions["quarters"],
): string {
  const label =
    labels.find((quarter) => quarter.no === quarterNo)?.label ?? `ไตรมาส ${quarterNo}`;
  return `${label} ปีงบประมาณ ${fiscalYear}`;
}

function buildUrl(
  filters: AdminActivitiesFilters,
  overrides: Partial<AdminActivitiesFilters> = {},
): string {
  const value = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (value.search) params.set("q", value.search);
  if (value.fiscalYear !== null) params.set("fy", String(value.fiscalYear));
  if (value.quarterNo !== null) params.set("quarter", String(value.quarterNo));
  if (value.departmentCode) params.set("department", value.departmentCode);
  if (value.activityTypeId !== null) {
    params.set("activity_type", String(value.activityTypeId));
  }
  if (value.status !== "all") params.set("status", value.status);
  if (value.sort !== "date") params.set("sort", value.sort);
  if (value.direction !== "desc") params.set("direction", value.direction);
  if (value.page > 1) params.set("page", String(value.page));
  const query = params.toString();
  return `/admin/activities${query ? `?${query}` : ""}`;
}

function formatContent(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

export function AdminActivities({
  content,
  data,
  filters,
  options,
}: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch(
        `/api/admin/activities/export${typeof window !== "undefined" ? window.location.search : ""}`,
        { method: "GET", cache: "no-store" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (body?.error === "export.limit") {
          throw new Error(content["all.export.limit"]);
        }
        throw new Error(content["all.export.error"]);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const utf8Match = disposition.match(/filename="([^"]+)"/);
      const filename =
        utf8Match?.[1] ??
        `activities_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (error) {
      setExportError(
        error instanceof Error && error.message
          ? error.message
          : content["all.export.error"],
      );
    } finally {
      setExporting(false);
    }
  }

  const start = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const end = Math.min(data.page * data.pageSize, data.total);

  function sortHeader(field: "date" | "participants" | "satisfaction", label: string) {
    const nextDirection =
      filters.sort === field && filters.direction === "desc" ? "asc" : "desc";
    return (
      <Link
        className="all-sort-link"
        href={buildUrl(filters, {
          sort: field,
          direction: nextDirection,
          page: 1,
        })}
        title={
          nextDirection === "asc"
            ? content["all.sort.ascending"]
            : content["all.sort.descending"]
        }
      >
        {label}
        <ArrowUpDown aria-hidden="true" size={13} />
      </Link>
    );
  }

  return (
    <div className="admin-activities-page">
      <section className="all-title-card">
        <div>
          <h1>{content["all.title"]}</h1>
          <p>
            {formatContent(content["all.subtitle"], {
              count: data.total.toLocaleString("th-TH"),
            })}
          </p>
        </div>
        <button
          className="all-export-button"
          type="button"
          onClick={handleExport}
          disabled={exporting}
        >
          <Download aria-hidden="true" size={17} />
          {exporting ? content["all.exporting"] : content["all.export"]}
        </button>
      </section>

      {exportError ? (
        <p className="all-export-error" role="alert">
          {exportError}
        </p>
      ) : null}

      <form className="all-filter-card" method="get" action="/admin/activities">
        <label className="all-search-field">
          <Search aria-hidden="true" size={17} />
          <input
            name="q"
            type="search"
            defaultValue={filters.search}
            placeholder={content["all.search.placeholder"]}
          />
        </label>
        <select name="fy" defaultValue={filters.fiscalYear?.toString() ?? ""}>
          <option value="">{content["all.filter.year"]}</option>
          {options.fiscalYears.map((year) => (
            <option key={year} value={year}>
              ปีงบประมาณ {year}
            </option>
          ))}
        </select>
        <select name="quarter" defaultValue={filters.quarterNo?.toString() ?? ""}>
          <option value="">{content["all.filter.quarter"]}</option>
          {options.quarters.map((quarter) => (
            <option key={quarter.no} value={quarter.no}>
              {quarter.label}
            </option>
          ))}
        </select>
        <select
          name="activity_type"
          defaultValue={filters.activityTypeId?.toString() ?? ""}
        >
          <option value="">{content["all.filter.activity_type"]}</option>
          {options.activityTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        <select
          name="department"
          defaultValue={filters.departmentCode ?? ""}
        >
          <option value="">{content["all.filter.department"]}</option>
          {options.departments.map((department) => (
            <option key={department.code} value={department.code}>
              {department.code} — {department.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={filters.status}>
          <option value="all">{content["all.status.all"]}</option>
          <option value="past">{content["all.status.past"]}</option>
          <option value="planned">{content["all.status.planned"]}</option>
          <option value="confirmed">{content["all.status.confirmed"]}</option>
          <option value="unconfirmed">{content["all.status.unconfirmed"]}</option>
        </select>
        <Link className="all-clear-button" href="/admin/activities">
          {content["all.filter.clear"]}
        </Link>
        <button className="all-filter-submit" type="submit">
          แสดงข้อมูล
        </button>
      </form>

      <section className="all-table-card" aria-busy="false">
        {data.total === 0 ? (
          <div className="all-empty">
            <p>{content["all.empty"]}</p>
            <Link className="all-clear-button" href="/admin/activities">
              {content["all.filter.clear"]}
            </Link>
          </div>
        ) : (
          <>
            <table className="all-activities-table">
              <thead>
                <tr>
                  <th>{content["all.column.activity"]}</th>
                  <th>{content["all.column.department"]}</th>
                  <th>{content["all.column.type"]}</th>
                  <th>{content["all.column.quarter"]}</th>
                  <th>{sortHeader("date", content["all.column.date"])}</th>
                  <th className="all-number-column">
                    {sortHeader("participants", content["all.column.participants"])}
                  </th>
                  <th className="all-number-column">
                    {sortHeader("satisfaction", content["all.column.satisfaction"])}
                  </th>
                  <th>{content["all.column.status"]}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const statusText =
                    item.status === "past"
                      ? content["all.status.past.label"]
                      : item.status === "confirmed"
                        ? content["all.status.confirmed.label"]
                        : content["all.status.unconfirmed.label"];
                  const statusClass =
                    item.status === "past"
                      ? "all-status-past"
                      : item.status === "confirmed"
                        ? "all-status-confirmed"
                        : "all-status-unconfirmed";
                  return (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td data-label={content["all.column.activity"]}>
                        <strong className="all-title">{item.title}</strong>
                        <span className="all-participant-name">
                          {item.participantTypeName}
                        </span>
                      </td>
                      <td data-label={content["all.column.department"]}>
                        <strong className="all-department-code">
                          {item.mainDepartment}
                        </strong>
                        <span className="all-department-name">
                          {item.mainDepartmentName}
                        </span>
                        {item.coOrganizers.length > 0 ? (
                          <span className="all-co-organizers">
                            {content["all.co_organizers"]}: {item.coOrganizers.join(", ")}
                          </span>
                        ) : null}
                      </td>
                      <td data-label={content["all.column.type"]}>
                        {item.activityTypeName}
                      </td>
                      <td data-label={content["all.column.quarter"]}>
                        {formatQuarter(
                          item.quarterNo,
                          item.fiscalYear,
                          options.quarters,
                        )}
                      </td>
                      <td data-label={content["all.column.date"]}>
                        {item.status === "unconfirmed"
                          ? `${monthThai[Number(item.startDate.slice(5, 7))]} ${
                              Number(item.startDate.slice(0, 4)) + 543
                            } (รอวัน)`
                          : formatThaiRange(item.startDate, item.endDate)}
                      </td>
                      <td
                        className="all-number-column"
                        data-label={content["all.column.participants"]}
                      >
                        {item.participants.toLocaleString("th-TH")}
                      </td>
                      <td
                        className="all-number-column"
                        data-label={content["all.column.satisfaction"]}
                      >
                        {item.satisfactionPercent === null
                          ? "-"
                          : `${item.satisfactionPercent.toLocaleString("th-TH", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}%`}
                      </td>
                      <td data-label={content["all.column.status"]}>
                        <span className={`all-status-pill ${statusClass}`}>
                          {statusText}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <footer className="all-pagination">
              <p>
                {formatContent(content["all.pagination.summary"], {
                  start: start.toLocaleString("th-TH"),
                  end: end.toLocaleString("th-TH"),
                  total: data.total.toLocaleString("th-TH"),
                })}
              </p>
              <nav aria-label={content["all.column.activity"]}>
                {data.page > 1 ? (
                  <Link
                    href={buildUrl(filters, { page: data.page - 1 })}
                    aria-label={content["all.pagination.previous"]}
                  >
                    <ChevronLeft aria-hidden="true" size={16} />
                    {content["all.pagination.previous"]}
                  </Link>
                ) : null}
                {data.page < data.totalPages ? (
                  <Link
                    href={buildUrl(filters, { page: data.page + 1 })}
                    aria-label={content["all.pagination.next"]}
                  >
                    {content["all.pagination.next"]}
                    <ChevronRight aria-hidden="true" size={16} />
                  </Link>
                ) : null}
              </nav>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
