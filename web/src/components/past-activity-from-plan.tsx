"use client";

import { useEffect, useState } from "react";
import {
  PastActivityForm,
  type PastActivityInitialData,
  type PlannedActivityOption,
} from "@/components/past-activity-form";
import type { AuthenticatedUser } from "@/lib/auth";
import type {
  ActivityTypeOption,
  DepartmentOption,
  ParticipantTypeOption,
  QuarterOption,
} from "@/lib/past-activity-data";
import type { SiteContent } from "@/lib/content";

interface PastActivityFromPlanProps {
  plannedId: string;
  content: SiteContent;
  user: AuthenticatedUser;
  departments: DepartmentOption[];
  activityTypes: ActivityTypeOption[];
  participantTypes: ParticipantTypeOption[];
  quarters: QuarterOption[];
  initialFiscalYear: number;
  initialQuarterNo: number;
}

function isPlannedActivity(value: unknown): value is PlannedActivityOption {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.id === "string" &&
    typeof data.fiscal_year === "number" &&
    typeof data.quarter_no === "number" &&
    typeof data.title === "string" &&
    typeof data.main_department === "string" &&
    typeof data.activity_type_id === "number" &&
    typeof data.participant_type_id === "number" &&
    typeof data.expected_start === "string" &&
    typeof data.expected_end === "string" &&
    typeof data.expected_participants === "number" &&
    (typeof data.location === "string" || data.location === null) &&
    (typeof data.ref_link === "string" || data.ref_link === null) &&
    Array.isArray(data.co_organizers) &&
    data.co_organizers.every((item) => typeof item === "string")
  );
}

export function PastActivityFromPlan(props: PastActivityFromPlanProps) {
  const [plan, setPlan] = useState<PlannedActivityOption | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/activities/planned/${encodeURIComponent(props.plannedId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok || typeof result !== "object" || result === null || !("activity" in result)) {
          throw new Error("Unable to load planned activity");
        }
        if (!isPlannedActivity(result.activity)) {
          throw new Error("Invalid planned activity response");
        }
        setPlan(result.activity);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(props.content["err.planned.invalid"]);
      });
    return () => controller.abort();
  }, [props.content, props.plannedId]);

  if (error) return <p className="mine-error" role="alert">{error}</p>;
  if (!plan) return <p className="mine-loading" role="status">{props.content["mine.loading"]}</p>;

  const initialData: PastActivityInitialData = {
    fiscal_year: plan.fiscal_year,
    quarter_no: plan.quarter_no,
    title: plan.title,
    main_department: plan.main_department,
    co_organizers: plan.co_organizers,
    activity_type_id: plan.activity_type_id,
    participant_type_id: plan.participant_type_id,
    start_date: plan.expected_start,
    end_date: plan.expected_end,
    total_participants: plan.expected_participants,
    result_summary: "",
    satisfaction_percent: "",
    image_consent: false,
    location: plan.location ?? "",
    ref_link: plan.ref_link ?? "",
    planned_id: plan.id,
    images: [],
  };
  return (
    <PastActivityForm
      {...props}
      initialData={initialData}
      initialMode="planned"
      initialPlannedActivity={plan}
    />
  );
}
