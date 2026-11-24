"use client";

import { useEffect, useState } from "react";
import { PastActivityForm, type PastActivityInitialData } from "@/components/past-activity-form";
import type { AuthenticatedUser } from "@/lib/auth";
import type {
  ActivityTypeOption,
  DepartmentOption,
  ParticipantTypeOption,
  QuarterOption,
} from "@/lib/past-activity-data";
import type { SiteContent } from "@/lib/content";

interface PastActivityEditorProps {
  id: string;
  content: SiteContent;
  user: AuthenticatedUser;
  departments: DepartmentOption[];
  activityTypes: ActivityTypeOption[];
  participantTypes: ParticipantTypeOption[];
  quarters: QuarterOption[];
}

function isPastActivityInitialData(value: unknown): value is PastActivityInitialData {
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
    typeof data.start_date === "string" &&
    typeof data.end_date === "string" &&
    typeof data.total_participants === "number" &&
    typeof data.result_summary === "string" &&
    typeof data.satisfaction_percent === "string" &&
    typeof data.image_consent === "boolean" &&
    typeof data.location === "string" &&
    typeof data.ref_link === "string" &&
    typeof data.planned_id === "string" &&
    Array.isArray(data.images) &&
    data.images.every(
      (image) =>
        typeof image === "object" &&
        image !== null &&
        "id" in image &&
        typeof image.id === "string" &&
        "src" in image &&
        typeof image.src === "string",
    )
  );
}

export function PastActivityEditor(props: PastActivityEditorProps) {
  const [activity, setActivity] = useState<PastActivityInitialData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/activities/past/${encodeURIComponent(props.id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok || typeof result !== "object" || result === null || !("activity" in result)) {
          throw new Error("Unable to load activity");
        }
        if (!isPastActivityInitialData(result.activity)) {
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
    <PastActivityForm
      {...props}
      editId={props.id}
      initialData={activity}
      initialFiscalYear={activity.fiscal_year}
      initialQuarterNo={activity.quarter_no}
    />
  );
}
