"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { AdminDashboardData, DashboardOptions } from "@/lib/admin-dashboard-data";
import type { SiteContent } from "@/lib/content";
import { ClearFiltersButton } from "@/components/clear-filters-button";

function formatResultCount(template: string, count: number): string {
  return template.replaceAll("{count}", count.toLocaleString("th-TH"));
}

export function DashboardFilterControls({
  content,
  data,
  options,
}: {
  content: SiteContent;
  data: AdminDashboardData;
  options: DashboardOptions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selection, setSelection] = useState({
    fiscalYear: String(data.filters.fiscalYear),
    quarter: String(data.filters.quarterNo),
    department: data.filters.departmentCode ?? "",
    activityType: data.filters.activityTypeId?.toString() ?? "",
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize controls after browser back/forward
    setSelection({
      fiscalYear: String(data.filters.fiscalYear),
      quarter: String(data.filters.quarterNo),
      department: data.filters.departmentCode ?? "",
      activityType: data.filters.activityTypeId?.toString() ?? "",
    });
  }, [data.filters]);

  function update(name: string, value: string) {
    const stateKey = name === "fiscal_year" ? "fiscalYear" : name === "activity_type" ? "activityType" : name;
    const updated = { ...selection, [stateKey]: value };
    setSelection(updated);
    const params = new URLSearchParams();
    const values = {
      fiscal_year: updated.fiscalYear,
      quarter: updated.quarter,
      department: updated.department,
      activity_type: updated.activityType,
    };
    for (const [key, nextValue] of Object.entries(values)) {
      if ((key === "fiscal_year" || key === "quarter") && nextValue) {
        params.set(key, nextValue);
      } else if (nextValue) {
        params.set(key, nextValue);
      }
    }
    const query = params.toString();
    startTransition(() => router.push(`/admin/dashboard${query ? `?${query}` : ""}`, { scroll: false }));
  }

  return (
    <form className="dashboard-filters" aria-busy={pending} onSubmit={(event) => event.preventDefault()}>
      {pending ? <span className="filter-loading-bar dashboard-filter-progress" aria-hidden="true" /> : null}
      <label>
        <span>{content["dashboard.filter.fiscal_year"]}</span>
        <select aria-label={content["dashboard.filter.fiscal_year"]} value={selection.fiscalYear} name="fiscal_year" onChange={(event) => update("fiscal_year", event.target.value)}>
          {options.fiscalYears.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
      <label>
        <span>{content["dashboard.filter.quarter"]}</span>
        <select aria-label={content["dashboard.filter.quarter"]} value={selection.quarter} name="quarter" onChange={(event) => update("quarter", event.target.value)}>
          {options.quarters.map((quarter) => <option key={quarter.no} value={quarter.no}>{quarter.label_th}</option>)}
        </select>
      </label>
      <label>
        <span>{content["dashboard.filter.department"]}</span>
        <select aria-label={content["dashboard.filter.department"]} value={selection.department} name="department" onChange={(event) => update("department", event.target.value)}>
          <option value="">{content["dashboard.filter.all"]}</option>
          {options.filterDepartments.map((department) => <option key={department.code} value={department.code}>{department.code} — {department.name_th}</option>)}
        </select>
      </label>
      <label>
        <span>{content["dashboard.filter.activity_type"]}</span>
        <select aria-label={content["dashboard.filter.activity_type"]} value={selection.activityType} name="activity_type" onChange={(event) => update("activity_type", event.target.value)}>
          <option value="">{content["dashboard.filter.all"]}</option>
          {options.filterActivityTypes.map((activityType) => <option key={activityType.id} value={activityType.id}>{activityType.name_th}</option>)}
        </select>
      </label>
      <ClearFiltersButton className="dashboard-filter-clear" href="/admin/dashboard" label={content["dashboard.filter.clear"]} />
      <p className="sr-only" aria-live="polite">
        {formatResultCount(
          content["dashboard.filter.results"],
          data.current.activityCount + data.plannedSummary.activityCount,
        )}
      </p>
    </form>
  );
}
