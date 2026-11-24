"use client";

import { useEffect, useState } from "react";
import {
  PlannedActivityForm,
  type PlannedActivityInitialData,
} from "@/components/planned-activity-form";
import type { AuthenticatedUser } from "@/lib/auth";
import type {
  ActivityTypeOption,
  DepartmentOption,
  ParticipantTypeOption,
  QuarterOption,
} from "@/lib/past-activity-data";
import type { SiteContent } from "@/lib/content";

interface PlannedActivityEditorProps {
  id: string;
  content: SiteContent;
  user: AuthenticatedUser;
  departments: DepartmentOption[];
  activityTypes: ActivityTypeOption[];
  participantTypes: ParticipantTypeOption[];
  quarters: QuarterOption[];
}

function isPlannedActivityInitialData(
  value: unknown,
): value is PlannedActivityInitialData {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.fiscal_year === "number" &&
    typeof data.quarter_no === "number" &&
    typeof data.title === "string" &&
    typeof data.main_department === "string" &&
    Array.isArray(data.co_organizers) &&
    data.co_organizers.every((item) => typeof item === "string") &&
    typeof data.activity_type_id === "number" &&
    typeof data.participant_type_id === "number" &&
    (data.date_status === "confirmed" || data.date_status === "unconfirmed") &&
    typeof data.expected_start === "string" &&
    typeof data.expected_end === "string" &&
    typeof data.expected_participants === "number" &&
    typeof data.banner_url === "string" &&
    (typeof data.banner_path === "string" || data.banner_path === null) &&
    typeof data.location === "string" &&
    typeof data.ref_link === "string"
  );
}

export function PlannedActivityEditor(props: PlannedActivityEditorProps) {
  const [activity, setActivity] = useState<PlannedActivityInitialData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/activities/planned/${encodeURIComponent(props.id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok || typeof result !== "object" || result === null || !("activity" in result)) {
          throw new Error("Unable to load activity");
        }
        if (!isPlannedActivityInitialData(result.activity)) {
          throw new Error("Invalid activity response");
        }
        setActivity(result.activity);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(props.content["mine.error"]);
      });
    return () => controller.abort();
  }, [props.content, props.id]);

  if (error) return <p className="mine-error" role="alert">{error}</p>;
  if (!activity) return <p className="mine-loading" role="status">{props.content["mine.loading"]}</p>;

  return (
    <PlannedActivityForm
      {...props}
      editId={props.id}
      initialData={activity}
      initialFiscalYear={activity.fiscal_year}
      initialQuarterNo={activity.quarter_no}
    />
  );
}
