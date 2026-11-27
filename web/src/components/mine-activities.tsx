"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  History,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { buildFilterQuery, isLatestRequest, resetFilterPage } from "@/lib/filter-navigation";
import { ClearFiltersButton } from "@/components/clear-filters-button";
import type { AuthenticatedUser } from "@/lib/auth";
import type { SiteContent } from "@/lib/content";
import type { DepartmentOption } from "@/lib/past-activity-data";
import type { QuarterOption } from "@/lib/past-activity-data";
import { ActivityFormHeader } from "@/components/activity-form-header";

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
  archived_at?: string;
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
  mode?: "mine" | "archive";
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
  mode = "mine",
}: MineActivitiesProps) {
  const [filters, setFilters] = useState<MineFilters>(initialFilters);
  const [data, setData] = useState(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const requestId = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelActionRef = useRef<HTMLButtonElement>(null);
  const [pendingAction, setPendingAction] = useState<{ item: MineActivity; action: "archive" | "restore" | "purge" } | null>(null);
  const apiPath = mode === "archive" ? "/api/activities/archive" : "/api/activities/mine";
  const pagePath = mode === "archive" ? "/activities/archive" : "/activities/mine";

  const load = useCallback(async (nextFilters: typeof filters) => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const query = buildFilterQuery(nextFilters);
      const response = await fetch(apiPath + "?" + query, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to load activities");
      const result = (await response.json()) as MineResponse;
      if (isLatestRequest(id, requestId.current)) setData(result);
    } catch {
      if (isLatestRequest(id, requestId.current)) setError(content["mine.error"]);
    } finally {
      if (isLatestRequest(id, requestId.current)) setLoading(false);
    }
  }, [apiPath, content]);

  useEffect(() => {
    void Promise.resolve().then(() => load(initialFilters));
    const handlePopState = () => {
      const current = filtersFromLocation();
      setFilters(current);
      void load(current);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      requestId.current += 1;
    };
  }, [initialFilters, load]);

  function updateUrl(
    nextFilters: typeof filters,
    history: "push" | "replace" = "push",
    resetPage = true,
  ) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const normalized = resetPage ? resetFilterPage(nextFilters) : nextFilters;
    const query = buildFilterQuery(normalized);
    window.history[history === "push" ? "pushState" : "replaceState"](
      null,
      "",
      query ? pagePath + "?" + query : pagePath,
    );
    setFilters(normalized);
    void load(normalized);
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    updateUrl(filters, "replace");
  }

  function changeKind(type: ActivityKind) {
    updateUrl({ ...filters, type, page: "1" });
  }

  function clearFilters() {
    const cleared = { ...filters, fiscalYear: "", quarterNo: "", activityTypeId: "", departmentCode: "", search: "", page: "1" };
    updateUrl(cleared);
  }

  async function applyArchiveAction() {
    if (!pendingAction || submittingAction) return;
    const { item, action } = pendingAction;
    setSubmittingAction(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/activities/archive/" + filters.type + "/" + item.id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("Unable to update archived activity");
      setNotice(content[("archive.success." + action) as keyof SiteContent]);
      setPendingAction(null);
      await load(filters);
    } catch {
      setError(content["err.archive.action"]);
    } finally {
      setSubmittingAction(false);
    }
  }

  useEffect(() => {
    if (pendingAction) cancelActionRef.current?.focus();
  }, [pendingAction]);

  const page = data.page || 1;
  const pages = data.totalPages || 1;
  const createHref = filters.type === "past" ? "/activities/past/new" : "/activities/planned/new";

  return (
    <>
    <ActivityFormHeader
      content={content}
      titleKey={mode === "archive" ? "archive.title" : "mine.title"}
      descriptionKey={mode === "archive" ? "archive.description" : "mine.description"}
      rightAction={mode === "archive" ? (
        <Link className="activity-form-back-button" href="/activities/mine">
          <ArrowLeft aria-hidden="true" size={16} />{content["archive.back"]}
        </Link>
      ) : (
        <div className="mine-heading-actions">
          <Link aria-label={content["archive.action.open"]} className="mine-archive-button" href="/activities/archive" title={content["archive.action.open"]}>
            <History aria-hidden="true" size={18} />
          </Link>
          <Link className="mine-create-button mine-create-past" href="/activities/past/new">{content["mine.create_past"]}</Link>
          <Link className="mine-create-button mine-create-planned" href="/activities/planned/new">{content["mine.create_planned"]}</Link>
        </div>
      )}
    />
    <section className="mine-card" aria-label={content[mode === "archive" ? "archive.title" : "mine.title"]}>
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
              aria-label={content["mine.search.label"]}
              onChange={(event) => {
                const next = { ...filters, search: event.target.value, page: "1" };
                setFilters(next);
                if (searchTimer.current) clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => updateUrl(next, "replace"), 350);
              }}
              placeholder={content["mine.search.placeholder"]}
              value={filters.search}
            />
          </span>
        </label>
        <label>
          <span>{content["form1.field.fiscal_year"]}</span>
          <select aria-label={content["form1.field.fiscal_year"]}
            onChange={(event) => updateUrl({ ...filters, fiscalYear: event.target.value })}
            value={filters.fiscalYear}
          >
            <option value="">{content["mine.filter.year"]}</option>
            {fiscalYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>
          <span>{content["form1.field.quarter"]}</span>
          <select aria-label={content["form1.field.quarter"]}
            onChange={(event) => updateUrl({ ...filters, quarterNo: event.target.value })}
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
          <select aria-label={content["form1.field.activity_type"]}
            onChange={(event) => updateUrl({ ...filters, activityTypeId: event.target.value })}
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
            <select aria-label={content["form1.field.main_department"]}
              onChange={(event) => updateUrl({ ...filters, departmentCode: event.target.value })}
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
          <ClearFiltersButton label={content["mine.filter.clear"]} onClick={clearFilters} />
        </div>
      </form>

      {notice ? <p className="mine-notice" role="status">{notice}</p> : null}
      {error ? <p className="mine-error" role="alert">{error}</p> : null}
      <div className="mine-results" aria-busy={loading}>
      {loading && data.total > 0 ? <div className="filter-loading-bar" aria-hidden="true" /> : null}
      <p className="sr-only" aria-live="polite">{template(content["mine.pagination.summary"], { page, pages, count: data.total })}</p>
      {loading && data.total === 0 ? (
        <div className="mine-loading" role="status">{content["mine.loading"]}</div>
      ) : error ? null : data.items.length === 0 ? (
        <div className="mine-empty-state">
          <p>{filters.fiscalYear || filters.quarterNo || filters.activityTypeId || filters.departmentCode || filters.search
            ? content["mine.filter.no_results"]
            : content["mine.empty"]}</p>
          {mode === "archive" ? (
            <Link className="mine-create-button mine-create-past" href="/activities/mine">{content["archive.back"]}</Link>
          ) : (
            <Link className="mine-create-button mine-create-past" href={createHref}>{content["mine.empty.create"]}</Link>
          )}
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
                  {mode === "archive" ? <th>{content["archive.column.date"]}</th> : null}
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
                              src={`/api/activities/past/images/${item.image_id}${mode === "archive" ? "?scope=archive" : ""}`}
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
                      {mode === "archive" ? <td data-label={content["archive.column.date"]}>{item.archived_at ? formatDate(item.archived_at.slice(0, 10)) : "—"}</td> : null}
                      <td data-label={content["mine.column.actions"]}>
                        <div className="mine-row-actions">
                          {mode === "mine" ? <Link aria-label={`${content["mine.action.edit"]}: ${item.title}`} className="mine-icon-action" href={editHref}>
                            <Pencil aria-hidden="true" size={16} />
                            <span>{content["mine.action.edit"]}</span>
                          </Link> : null}
                          {mode === "mine" && filters.type === "planned" && !item.result_recorded ? (
                            <Link
                              className="mine-record-result"
                              href={`/activities/past/new?plannedId=${encodeURIComponent(item.id)}`}
                            >
                              {content["mine.action.record_result"]}
                            </Link>
                          ) : null}
                          {mode === "mine" ? (
                            <button aria-label={content["archive.action.store"] + ": " + item.title} className="mine-icon-action mine-archive-action whitespace-nowrap" onClick={() => setPendingAction({ item, action: "archive" })} type="button">
                              <Archive aria-hidden="true" size={16} /><span>{content["archive.action.store"]}</span>
                            </button>
                          ) : (
                            <>
                              <button className="mine-icon-action mine-restore-action" onClick={() => setPendingAction({ item, action: "restore" })} type="button">
                                <RotateCcw aria-hidden="true" size={16} /><span>{content["archive.action.restore"]}</span>
                              </button>
                              <button className="mine-icon-action mine-purge-action" onClick={() => setPendingAction({ item, action: "purge" })} type="button">
                                <ShieldAlert aria-hidden="true" size={16} /><span>{content["archive.action.purge"]}</span>
                              </button>
                            </>
                          )}
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
                onClick={() => updateUrl({ ...filters, page: String(page - 1) }, "push", false)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={17} />
                {content["mine.pagination.previous"]}
              </button>
              <button
                disabled={page >= pages}
                onClick={() => updateUrl({ ...filters, page: String(page + 1) }, "push", false)}
                type="button"
              >
                {content["mine.pagination.next"]}
                <ChevronRight aria-hidden="true" size={17} />
              </button>
            </div>
          </div>
        </>
      )}
      </div>
    </section>
    {pendingAction ? (
      <div className="archive-modal-backdrop" onMouseDown={(event) => { if (!submittingAction && event.target === event.currentTarget) setPendingAction(null); }}>
        <section aria-labelledby="archive-dialog-title" aria-modal="true" className="archive-modal" role="alertdialog">
          <h2 id="archive-dialog-title">{content["archive.confirm.title"]}</h2>
          <p>{template(content[("archive.confirm." + pendingAction.action) as keyof SiteContent], { title: pendingAction.item.title })}</p>
          {pendingAction.action === "purge" ? <p className="archive-purge-warning">{content["archive.confirm.purge.warning"]}</p> : null}
          {error ? <p className="mine-error" role="alert">{error}</p> : null}
          <div className="archive-modal-actions">
            <button ref={cancelActionRef} className="archive-cancel-button" disabled={submittingAction} onClick={() => setPendingAction(null)} type="button">{content["archive.confirm.cancel"]}</button>
            <button className={pendingAction.action === "purge" ? "archive-submit-button archive-submit-danger" : "archive-submit-button"} disabled={submittingAction || loading} onClick={() => void applyArchiveAction()} type="button">
              {submittingAction ? content["archive.confirm.submitting"] : content["archive.confirm.submit"]}
            </button>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
