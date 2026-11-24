"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AuthenticatedUser } from "@/lib/auth";
import type { SiteContent } from "@/lib/content";
import type { DepartmentOption } from "@/lib/past-activity-data";
import type { QuarterOption } from "@/lib/past-activity-data";

interface ActivityTypeOption {
  id: number;
  name_th: string;
}

interface MineActivity {
  id: string;
  fiscal_year: number;
  quarter_no: number;
  title: string;
  main_department: string;
  department_name: string;
  activity_type_id: number;
  activity_type_name: string;
  start_date: string;
  end_date: string;
  participants: number;
  date_status: "confirmed" | "unconfirmed" | null;
  image_id: string | null;
  planned_id: string | null;
  result_recorded: boolean;
}

interface MineResponse {
  counts: { past: number; planned: number };
  items: MineActivity[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface MineActivitiesProps {
  activityTypes: ActivityTypeOption[];
  content: SiteContent;
  departments: DepartmentOption[];
  fiscalYears: number[];
  quarters: QuarterOption[];
  role: AuthenticatedUser["role"];
  initialFilters: MineFilters;
}

type ActivityKind = "past" | "planned";

interface MineFilters {
  type: ActivityKind;
  fiscalYear: string;
  quarterNo: string;
  activityTypeId: string;
  departmentCode: string;
  search: string;
  page: string;
}

const EMPTY_RESPONSE: MineResponse = {
  counts: { past: 0, planned: 0 },
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

function template(content: string, values: Record<string, string | number>) {
  return content.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function filtersFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return {
    type: (params.get("type") === "planned" ? "planned" : "past") as ActivityKind,
    fiscalYear: params.get("fiscalYear") ?? "",
    quarterNo: params.get("quarterNo") ?? "",
    activityTypeId: params.get("activityTypeId") ?? "",
    departmentCode: params.get("departmentCode") ?? "",
    search: params.get("search") ?? "",
    page: params.get("page") ?? "1",
  };
}

export function MineActivities({
  activityTypes,
  content,
  departments,
  fiscalYears,
  quarters,
  role,
  initialFilters,
}: MineActivitiesProps) {
  const [filters, setFilters] = useState<MineFilters>(initialFilters);
  const [data, setData] = useState(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (nextFilters: typeof filters) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(nextFilters)) {
        if (value) query.set(key, value);
      }
      const response = await fetch(`/api/activities/mine?${query.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to load activities");
      const result = (await response.json()) as MineResponse;
      setData(result);
    } catch {
      setError(content["mine.error"]);
    } finally {
      setLoading(false);
    }
  }, [content]);

  useEffect(() => {
    void Promise.resolve().then(() => load(initialFilters));
    const handlePopState = () => {
      const current = filtersFromLocation();
      setFilters(current);
      void load(current);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialFilters, load]);

  function updateUrl(nextFilters: typeof filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    window.history.pushState(null, "", query ? `/activities/mine?${query}` : "/activities/mine");
    setFilters(nextFilters);
    void load(nextFilters);
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateUrl({ ...filters, page: "1" });
  }

  function changeKind(type: ActivityKind) {
    updateUrl({ ...filters, type, page: "1" });
  }

  function clearFilters() {
    const cleared = { ...filters, fiscalYear: "", quarterNo: "", activityTypeId: "", departmentCode: "", search: "", page: "1" };
    updateUrl(cleared);
  }

  async function deleteItem(item: MineActivity) {
    const confirmation = template(content["mine.delete.confirm"], { title: item.title });
    if (!window.confirm(confirmation)) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/activities/${filters.type}/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Unable to delete activity");
      setNotice(content["mine.delete.success"]);
      await load(filters);
    } catch {
      setError(content["err.mine.delete"]);
    }
  }

  const page = data.page || 1;
  const pages = data.totalPages || 1;
  const createHref = filters.type === "past" ? "/activities/past/new" : "/activities/planned/new";

  return (
    <section className="mine-card" aria-label={content["mine.title"]}>
      <div className="mine-tabs" role="tablist" aria-label={content["mine.title"]}>
        <button
          aria-selected={filters.type === "past"}
          className={filters.type === "past" ? "mine-tab mine-tab-active" : "mine-tab"}
          onClick={() => changeKind("past")}
          role="tab"
          type="button"
        >
          {template(content["mine.tab.past"], { count: data.counts.past })}
        </button>
        <button
          aria-selected={filters.type === "planned"}
          className={filters.type === "planned" ? "mine-tab mine-tab-active" : "mine-tab"}
          onClick={() => changeKind("planned")}
          role="tab"
          type="button"
        >
          {template(content["mine.tab.planned"], { count: data.counts.planned })}
        </button>
      </div>

      <form className="mine-filters" onSubmit={submitFilters}>
        <label className="mine-search-field">
          <span>{content["mine.search.label"]}</span>
          <span className="mine-search-input">
            <Search aria-hidden="true" size={17} />
            <input
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              placeholder={content["mine.search.placeholder"]}
              value={filters.search}
            />
          </span>
        </label>
        <label>
          <span>{content["form1.field.fiscal_year"]}</span>
          <select
            onChange={(event) => setFilters({ ...filters, fiscalYear: event.target.value })}
            value={filters.fiscalYear}
          >
            <option value="">{content["mine.filter.year"]}</option>
            {fiscalYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>
          <span>{content["form1.field.quarter"]}</span>
          <select
            onChange={(event) => setFilters({ ...filters, quarterNo: event.target.value })}
            value={filters.quarterNo}
          >
            <option value="">{content["mine.filter.quarter"]}</option>
            {quarters.map((quarter) => (
              <option key={quarter.no} value={quarter.no}>{quarter.label_th}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{content["form1.field.activity_type"]}</span>
          <select
            onChange={(event) => setFilters({ ...filters, activityTypeId: event.target.value })}
            value={filters.activityTypeId}
          >
            <option value="">{content["mine.filter.activity_type"]}</option>
            {activityTypes.map((activityType) => (
              <option key={activityType.id} value={activityType.id}>{activityType.name_th}</option>
            ))}
          </select>
        </label>
        {role === "admin" ? (
          <label>
            <span>{content["form1.field.main_department"]}</span>
            <select
              onChange={(event) => setFilters({ ...filters, departmentCode: event.target.value })}
              value={filters.departmentCode}
            >
              <option value="">{content["mine.filter.department"]}</option>
              {departments.map((department) => (
                <option key={department.code} value={department.code}>
                  {department.code} - {department.name_th}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mine-filter-actions">
          <button className="mine-filter-apply" type="submit">{content["mine.filter.apply"]}</button>
          <button className="mine-filter-clear" onClick={clearFilters} type="button">
            <FilterX aria-hidden="true" size={16} />
            {content["mine.filter.clear"]}
          </button>
        </div>
      </form>

      {notice ? <p className="mine-notice" role="status">{notice}</p> : null}
      {error ? <p className="mine-error" role="alert">{error}</p> : null}
      {loading ? (
        <div className="mine-loading" role="status">{content["mine.loading"]}</div>
      ) : error ? null : data.items.length === 0 ? (
        <div className="mine-empty-state">
          <p>{content["mine.empty"]}</p>
          <Link className="mine-create-button mine-create-past" href={createHref}>
            {content["mine.empty.create"]}
          </Link>
        </div>
      ) : (
        <>
          <div className="mine-table-wrap">
            <table className="mine-table">
              <thead>
                <tr>
                  <th>{content["mine.column.title"]}</th>
                  <th>{content["mine.column.quarter"]}</th>
                  <th>{content["mine.column.activity_type"]}</th>
                  <th>{content["mine.column.date"]}</th>
                  <th>{content["mine.column.participants"]}</th>
                  <th>{content["mine.column.status"]}</th>
                  <th>{content["mine.column.actions"]}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const editHref = `/activities/${filters.type}/${item.id}/edit`;
                  const dateStart = formatDate(item.start_date);
                  const dateEnd = formatDate(item.end_date);
                  return (
                    <tr key={item.id}>
                      <td data-label={content["mine.column.title"]}>
                        <div className="mine-title-cell">
                          {filters.type === "past" && item.image_id ? (
                            <Image
                              alt=""
                              className="mine-thumbnail"
                              height={54}
                              src={`/api/activities/past/images/${item.image_id}`}
                              unoptimized
                              width={72}
                            />
                          ) : null}
                          <div>
                            <strong>{item.title}</strong>
                            <span>{item.main_department} - {item.department_name}</span>
                            {filters.type === "past" && item.planned_id ? (
                              <span className="mine-badge mine-badge-blue">{content["mine.badge.from_plan"]}</span>
                            ) : null}
                            {filters.type === "planned" && !item.result_recorded ? (
                              <span className="mine-badge mine-badge-warning">
                                <AlertTriangle aria-hidden="true" size={13} />
                                {content["mine.badge.not_recorded"]}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td data-label={content["mine.column.quarter"]}>
                        {quarters.find((quarter) => quarter.no === item.quarter_no)?.label_th ?? item.quarter_no}
                        <br />{content["mine.fiscal_year.label"]} {item.fiscal_year}
                      </td>
                      <td data-label={content["mine.column.activity_type"]}>{item.activity_type_name}</td>
                      <td data-label={content["mine.column.date"]}>{dateStart} – {dateEnd}</td>
                      <td data-label={content["mine.column.participants"]}>
                        {item.participants} {content["mine.unit.people"]}
                      </td>
                      <td data-label={content["mine.column.status"]}>
                        {filters.type === "past"
                          ? content["mine.status.completed"]
                          : item.date_status === "confirmed"
                            ? content["mine.status.confirmed"]
                            : content["mine.status.unconfirmed"]}
                      </td>
                      <td data-label={content["mine.column.actions"]}>
                        <div className="mine-row-actions">
                          <Link aria-label={`${content["mine.action.edit"]}: ${item.title}`} className="mine-icon-action" href={editHref}>
                            <Pencil aria-hidden="true" size={16} />
                            <span>{content["mine.action.edit"]}</span>
                          </Link>
                          {filters.type === "planned" && !item.result_recorded ? (
                            <Link
                              className="mine-record-result"
                              href={`/activities/past/new?plannedId=${encodeURIComponent(item.id)}`}
                            >
                              {content["mine.action.record_result"]}
                            </Link>
                          ) : null}
                          <button
                            aria-label={`${content["mine.action.delete"]}: ${item.title}`}
                            className="mine-icon-action mine-delete-action"
                            onClick={() => void deleteItem(item)}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                            <span>{content["mine.action.delete"]}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mine-pagination">
            <span>{template(content["mine.pagination.summary"], { page, pages, count: data.total })}</span>
            <div>
              <button
                disabled={page <= 1}
                onClick={() => updateUrl({ ...filters, page: String(page - 1) })}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={17} />
                {content["mine.pagination.previous"]}
              </button>
              <button
                disabled={page >= pages}
                onClick={() => updateUrl({ ...filters, page: String(page + 1) })}
                type="button"
              >
                {content["mine.pagination.next"]}
                <ChevronRight aria-hidden="true" size={17} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
