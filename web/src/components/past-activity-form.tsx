"use client";

import Image from "next/image";
import Link from "next/link";
import { ImagePlus, Info, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ActivityFormHeader } from "@/components/activity-form-header";
import {
  getInitialMainDepartment,
  updateMainDepartment,
} from "@/lib/activity-department";
import type { AuthenticatedUser } from "@/lib/auth";
import type {
  ActivityTypeOption,
  DepartmentOption,
  ParticipantTypeOption,
  QuarterOption,
} from "@/lib/past-activity-data";
import type { ContentKey, SiteContent } from "@/lib/content";
import {
  formatBuddhistCalendarDate,
  formatQuarterDateRangeMessage,
  formatQuarterDateError,
  getBangkokToday,
  getDateInputYear,
  getQuarterDateRange,
  getVisibleActivityDateError,
  validateActivityDates,
} from "@/lib/activity-date-validation";

export interface PlannedActivityOption {
  id: string;
  fiscal_year: number;
  quarter_no: number;
  title: string;
  main_department: string;
  activity_type_id: number;
  participant_type_id: number;
  expected_start: string;
  expected_end: string;
  expected_participants: number;
  location: string | null;
  ref_link: string | null;
  co_organizers: string[];
}

interface PastActivityFormProps {
  content: SiteContent;
  user: AuthenticatedUser;
  departments: DepartmentOption[];
  activityTypes: ActivityTypeOption[];
  participantTypes: ParticipantTypeOption[];
  quarters: QuarterOption[];
  initialFiscalYear: number;
  initialQuarterNo: number;
  editId?: string;
  initialData?: PastActivityInitialData;
  initialMode?: "planned" | "new";
  initialPlannedActivity?: PlannedActivityOption;
}

export interface PastActivityInitialData {
  fiscal_year: number;
  quarter_no: number;
  title: string;
  main_department: string;
  co_organizers: string[];
  activity_type_id: number;
  participant_type_id: number;
  start_date: string;
  end_date: string;
  total_participants: number;
  result_summary: string;
  satisfaction_percent: string;
  image_consent: boolean;
  location: string;
  ref_link: string;
  planned_id: string;
  images: { id: string; src: string }[];
}

interface FormValues {
  fiscalYear: string;
  quarterNo: string;
  title: string;
  mainDepartment: string;
  coOrganizers: string[];
  activityTypeId: string;
  participantTypeId: string;
  startDate: string;
  endDate: string;
  totalParticipants: string;
  resultSummary: string;
  satisfactionPercent: string;
  location: string;
  refLink: string;
  imageConsent: boolean;
  plannedId: string;
}

type FieldName =
  | "fiscal_year"
  | "quarter_no"
  | "title"
  | "main_department"
  | "co_organizers"
  | "activity_type_id"
  | "participant_type_id"
  | "start_date"
  | "end_date"
  | "total_participants"
  | "result_summary"
  | "satisfaction_percent"
  | "images"
  | "image_consent"
  | "location"
  | "ref_link"
  | "planned_id";

type FieldErrors = Partial<Record<FieldName, string>>;
type DateFieldName = "start_date" | "end_date";

function withoutDateErrors(errors: FieldErrors): FieldErrors {
  const next = { ...errors };
  delete next.start_date;
  delete next.end_date;
  return next;
}

interface PreviewImage {
  file?: File;
  existingId?: string;
  previewUrl: string;
}

function isPlannedActivityList(
  value: unknown,
): value is { plans: PlannedActivityOption[] } {
  if (typeof value !== "object" || value === null || !("plans" in value)) {
    return false;
  }
  const plans = value.plans;
  return (
    Array.isArray(plans) &&
    plans.every(
      (plan) =>
        typeof plan === "object" &&
        plan !== null &&
        "id" in plan &&
        typeof plan.id === "string" &&
        "fiscal_year" in plan &&
        typeof plan.fiscal_year === "number" &&
        "quarter_no" in plan &&
        typeof plan.quarter_no === "number" &&
        "title" in plan &&
        typeof plan.title === "string" &&
        "main_department" in plan &&
        typeof plan.main_department === "string" &&
        "activity_type_id" in plan &&
        typeof plan.activity_type_id === "number" &&
        "participant_type_id" in plan &&
        typeof plan.participant_type_id === "number" &&
        "expected_start" in plan &&
        typeof plan.expected_start === "string" &&
        "expected_end" in plan &&
        typeof plan.expected_end === "string" &&
        "expected_participants" in plan &&
        typeof plan.expected_participants === "number" &&
        "location" in plan &&
        (typeof plan.location === "string" || plan.location === null) &&
        "ref_link" in plan &&
        (typeof plan.ref_link === "string" || plan.ref_link === null) &&
        "co_organizers" in plan &&
        Array.isArray(plan.co_organizers) &&
        plan.co_organizers.every((code: unknown) => typeof code === "string"),
    )
  );
}

function contentMessage(content: SiteContent, key: unknown): string {
  if (typeof key === "string" && Object.hasOwn(content, key)) {
    return content[key as ContentKey];
  }
  return content["err.save"];
}

function dateErrorMessage(
  content: SiteContent,
  key: unknown,
  fiscalYear: string,
  quarterNo: string,
): string {
  const message = contentMessage(content, key);
  return key === "err.date.quarter"
    ? formatQuarterDateError(
        message,
        Number(fiscalYear),
        Number(quarterNo),
        content["form.date.quarter_range"],
      )
    : message;
}

function FormField({
  id,
  label,
  error,
  help,
  required = false,
  labelAddon,
  gridArea,
  labelAsText = false,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  required?: boolean;
  labelAddon?: ReactNode;
  gridArea?: string;
  labelAsText?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`past-field${error ? " past-field-invalid" : ""}${gridArea ? ` past-field-${gridArea}` : ""}`}
    >
      <div className="past-field-label-row">
        {labelAsText ? (
          <span className="past-field-label" id={`${id}-label`}>
            {label}
          </span>
        ) : (
          <label
            className="past-field-label"
            htmlFor={id}
            id={`${id}-label`}
          >
            {label}
            {required ? (
              <span aria-hidden="true" className="required-mark">
                *
              </span>
            ) : null}
          </label>
        )}
        {labelAddon}
      </div>
      {children}
      {help ? (
        <p className="past-field-help" id={`${id}-help`}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="past-field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PastActivityForm({
  content,
  user,
  departments,
  activityTypes,
  participantTypes,
  quarters,
  initialFiscalYear,
  initialQuarterNo,
  editId,
  initialData,
  initialMode = "new",
  initialPlannedActivity,
}: PastActivityFormProps) {
  const router = useRouter();
  const previewUrls = useRef(new Set<string>());
  const imageInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<FormValues>({
    fiscalYear: String(initialData?.fiscal_year ?? initialFiscalYear),
    quarterNo: String(initialData?.quarter_no ?? initialQuarterNo),
    title: initialData?.title ?? "",
    mainDepartment:
      initialData?.main_department ??
      getInitialMainDepartment(user.role, user.department_code),
    coOrganizers: initialData?.co_organizers ?? [],
    activityTypeId: initialData ? String(initialData.activity_type_id) : "",
    participantTypeId: initialData ? String(initialData.participant_type_id) : "",
    startDate: initialData?.start_date ?? "",
    endDate: initialData?.end_date ?? "",
    totalParticipants: initialData ? String(initialData.total_participants) : "",
    resultSummary: initialData?.result_summary ?? "",
    satisfactionPercent: initialData?.satisfaction_percent ?? "",
    location: initialData?.location ?? "",
    refLink: initialData?.ref_link ?? "",
    imageConsent: initialData?.image_consent ?? false,
    plannedId: initialData?.planned_id ?? "",
  });
  const [mode, setMode] = useState<"planned" | "new">(initialMode);
  const [plannedActivities, setPlannedActivities] = useState<
    PlannedActivityOption[]
  >(initialPlannedActivity ? [initialPlannedActivity] : []);
  const [plannedLoading, setPlannedLoading] = useState(false);
  const [plannedError, setPlannedError] = useState("");
  const [images, setImages] = useState<PreviewImage[]>(
    initialData?.images.map((image) => ({
      existingId: image.id,
      previewUrl: image.src,
    })) ?? [],
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dateFieldsTouched, setDateFieldsTouched] = useState<
    Partial<Record<DateFieldName, boolean>>
  >({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [activityTooltipOpen, setActivityTooltipOpen] = useState(false);

  const plannedRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      plannedRequest.current?.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  function loadPlannedActivities(
    fiscalYearValue: string,
    quarterValue: string,
    departmentCode: string,
  ) {
    plannedRequest.current?.abort();
    const fiscalYear = Number(fiscalYearValue);
    const quarterNo = Number(quarterValue);
    if (
      !Number.isInteger(fiscalYear) ||
      !Number.isInteger(quarterNo) ||
      !departmentCode
    ) {
      setPlannedActivities([]);
      setPlannedLoading(false);
      setPlannedError("");
      return;
    }

    const controller = new AbortController();
    plannedRequest.current = controller;
    const params = new URLSearchParams({
      fiscalYear: String(fiscalYear),
      quarterNo: String(quarterNo),
      departmentCode,
    });
    setPlannedLoading(true);
    setPlannedError("");
    setPlannedActivities([]);

    void fetch(`/api/activities/past/planned?${params}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (controller.signal.aborted) {
          return;
        }
        if (!response.ok) {
          setPlannedError(
            contentMessage(
              content,
              typeof result === "object" && result !== null && "errorKey" in result
                ? result.errorKey
                : "err.save",
            ),
          );
          setPlannedActivities([]);
          return;
        }
        if (!isPlannedActivityList(result)) {
          throw new Error("Invalid planned activities response.");
        }
        setPlannedActivities(result.plans);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (controller.signal.aborted) {
          return;
        }
        setPlannedActivities([]);
        setPlannedError(content["err.save"]);
      })
      .finally(() => {
        if (plannedRequest.current === controller) {
          setPlannedLoading(false);
          plannedRequest.current = null;
        }
      });
  }

  function updateValue<K extends keyof FormValues>(
    key: K,
    value: FormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      const field = keyToField[key];
      if (field) {
        delete next[field];
      }
      return next;
    });
    const field = keyToField[key];
    if (field === "start_date" || field === "end_date") {
      setDateFieldsTouched((current) => {
        const next = { ...current };
        if (field === "start_date") next.start_date = true;
        else next.end_date = true;
        return next;
      });
    }
  }

  function selectPlannedActivity(id: string) {
    const planned = plannedActivities.find((activity) => activity.id === id);
    if (!planned) {
      updateValue("plannedId", "");
      return;
    }
    setValues((current) => ({
      ...current,
      plannedId: planned.id,
      fiscalYear: String(planned.fiscal_year),
      quarterNo: String(planned.quarter_no),
      title: planned.title,
      mainDepartment: planned.main_department,
      coOrganizers: planned.co_organizers,
      activityTypeId: String(planned.activity_type_id),
      participantTypeId: String(planned.participant_type_id),
      startDate: planned.expected_start,
      endDate: planned.expected_end,
      totalParticipants: String(planned.expected_participants),
      location: planned.location ?? "",
      refLink: planned.ref_link ?? "",
    }));
    setFieldErrors({});
  }

  function addImages(fileList: FileList | null) {
    if (!fileList?.length || images.length >= 5) {
      return;
    }
    const selected = Array.from(fileList);
    if (images.length + selected.length > 5) {
      setFieldErrors((current) => ({
        ...current,
        images: content["err.image.max"],
      }));
      return;
    }
    const unsupported = selected.find(
      (file) => file.type !== "image/jpeg" && file.type !== "image/png",
    );
    if (unsupported) {
      setFieldErrors((current) => ({
        ...current,
        images: content["err.image.type"],
      }));
      return;
    }
    const oversized = selected.find((file) => file.size > 5 * 1024 * 1024);
    if (oversized) {
      setFieldErrors((current) => ({
        ...current,
        images: content["err.image.size"],
      }));
      return;
    }

    const nextImages = selected.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return { file, previewUrl };
    });
    setImages((current) => [...current, ...nextImages]);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.images;
      return next;
    });
  }

  function removeImage(previewUrl: string) {
    if (previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
      previewUrls.current.delete(previewUrl);
    }
    setImages((current) =>
      current.filter((image) => image.previewUrl !== previewUrl),
    );
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.images;
      return next;
    });
  }

  function toggleCoOrganizer(departmentCode: string) {
    if (departmentCode === values.mainDepartment) {
      return;
    }
    const selected = values.coOrganizers.includes(departmentCode);
    updateValue(
      "coOrganizers",
      selected
        ? values.coOrganizers.filter((code) => code !== departmentCode)
        : [...values.coOrganizers, departmentCode],
    );
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const setRequired = (field: FieldName, value: string) => {
      if (!value.trim()) {
        errors[field] = content["err.required"];
      }
    };

    setRequired("fiscal_year", values.fiscalYear);
    setRequired("quarter_no", values.quarterNo);
    setRequired("title", values.title);
    setRequired("main_department", values.mainDepartment);
    setRequired("activity_type_id", values.activityTypeId);
    setRequired("participant_type_id", values.participantTypeId);
    setRequired("start_date", values.startDate);
    setRequired("end_date", values.endDate);
    setRequired("total_participants", values.totalParticipants);

    if (values.title && [...values.title].length > 150) {
      errors.title = content["err.title.max"];
    }
    if (values.resultSummary && [...values.resultSummary].length > 500) {
      errors.result_summary = content["err.result.max"];
    }
    if (values.location && [...values.location].length > 255) {
      errors.location = content["err.location.max"];
    }
    if (values.refLink && [...values.refLink].length > 500) {
      errors.ref_link = content["err.ref_link.max"];
    }

    const participants = Number(values.totalParticipants);
    if (
      values.totalParticipants &&
      (!Number.isInteger(participants) || participants < 1)
    ) {
      errors.total_participants = content["err.participants.min"];
    }

    if (values.satisfactionPercent) {
      if (!/^\d+(?:\.\d)?$/.test(values.satisfactionPercent)) {
        errors.satisfaction_percent = content["err.satisfaction.precision"];
      } else {
        const satisfaction = Number(values.satisfactionPercent);
        if (satisfaction < 0 || satisfaction > 100) {
          errors.satisfaction_percent = content["err.satisfaction.range"];
        }
      }
    }

    const dateError = validateActivityDates({
      fiscalYear: Number(values.fiscalYear),
      quarterNo: Number(values.quarterNo),
      startDate: values.startDate,
      endDate: values.endDate,
      startField: "start_date",
      endField: "end_date",
      startRule: "not_after_today",
    });
    if (dateError && !errors[dateError.field]) {
      errors[dateError.field] = dateErrorMessage(
        content,
        dateError.key,
        values.fiscalYear,
        values.quarterNo,
      );
    }

    if (new Set(values.coOrganizers).size !== values.coOrganizers.length) {
      errors.co_organizers = content["err.co.duplicate"];
    } else if (values.coOrganizers.includes(values.mainDepartment)) {
      errors.co_organizers = content["err.co.duplicate"];
    } else if (values.coOrganizers.length > 7) {
      errors.co_organizers = content["err.co.max"];
    }

    if (images.length === 0) {
      errors.images = content["err.image.required"];
    } else if (images.length > 5) {
      errors.images = content["err.image.max"];
    } else if (
      images.some(
        ({ file }) =>
          file !== undefined &&
          file.type !== "image/jpeg" &&
          file.type !== "image/png",
      )
    ) {
      errors.images = content["err.image.type"];
    } else if (
      images.some(({ file }) => file !== undefined && file.size > 5 * 1024 * 1024)
    ) {
      errors.images = content["err.image.size"];
    }

    if (!values.imageConsent) {
      errors.image_consent = content["err.image.consent"];
    }
    return errors;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    const errors = validate();
    setFieldErrors(withoutDateErrors(errors));
    setDateFieldsTouched({ start_date: true, end_date: true });
    if (Object.keys(errors).length > 0) {
      return;
    }

    const formData = new FormData();
    formData.set("fiscal_year", values.fiscalYear);
    formData.set("quarter_no", values.quarterNo);
    formData.set("title", values.title);
    formData.set("main_department", values.mainDepartment);
    formData.set("co_organizers", JSON.stringify(values.coOrganizers));
    formData.set("activity_type_id", values.activityTypeId);
    formData.set("participant_type_id", values.participantTypeId);
    formData.set("start_date", values.startDate);
    formData.set("end_date", values.endDate);
    formData.set("total_participants", values.totalParticipants);
    formData.set("result_summary", values.resultSummary);
    formData.set("satisfaction_percent", values.satisfactionPercent);
    formData.set("image_consent", values.imageConsent ? "1" : "0");
    formData.set("location", values.location);
    formData.set("ref_link", values.refLink);
    formData.set("planned_id", values.plannedId);
    for (const image of images) {
      if (image.file) formData.append("images", image.file);
    }
    formData.set(
      "keep_image_ids",
      JSON.stringify(
        images.flatMap((image) => (image.existingId ? [image.existingId] : [])),
      ),
    );

    setSaving(true);
    try {
      const response = await fetch(
        editId ? `/api/activities/past/${editId}` : "/api/activities/past",
        {
        method: editId ? "PATCH" : "POST",
        body: formData,
        },
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        const errorKey =
          typeof result === "object" && result !== null && "errorKey" in result
            ? result.errorKey
            : "err.save";
        const field =
          typeof result === "object" && result !== null && "field" in result
            ? result.field
            : null;
        if (typeof field === "string" && field in fieldErrorsByName) {
          if (field === "start_date" || field === "end_date") {
            setDateFieldsTouched((current) => ({ ...current, [field]: true }));
          } else {
            setFieldErrors((current) => ({
              ...current,
              [field]: contentMessage(content, errorKey),
            }));
          }
        } else {
          setSubmitError(contentMessage(content, errorKey));
        }
        return;
      }
      setSaved(true);
      window.setTimeout(
        () => router.replace(editId ? "/activities/mine?type=past" : "/"),
        1400,
      );
    } catch {
      setSubmitError(content["err.save"]);
    } finally {
      setSaving(false);
    }
  }

  const titleLength = [...values.title].length;
  const resultLength = [...values.resultSummary].length;
  const selectedActivityType = activityTypes.find(
    (activityType) => String(activityType.id) === values.activityTypeId,
  );
  const quarterDateRange = getQuarterDateRange(
    Number(values.fiscalYear),
    Number(values.quarterNo),
  );
  const quarterDateRangeMessage = formatQuarterDateRangeMessage(
    content["form.date.quarter_range"],
    Number(values.fiscalYear),
    Number(values.quarterNo),
  );
  const today = getBangkokToday();
  const startDateMax = quarterDateRange
    ? quarterDateRange.end < today
      ? quarterDateRange.end
      : today
    : undefined;
  const formattedStartDate = formatBuddhistCalendarDate(values.startDate);
  const formattedEndDate = formatBuddhistCalendarDate(values.endDate);
  const validStartDate = Boolean(
    quarterDateRange &&
      formattedStartDate &&
      values.startDate >= quarterDateRange.start &&
      values.startDate <= quarterDateRange.end,
  );
  const endDateMin = quarterDateRange
    ? validStartDate && values.startDate > quarterDateRange.start
      ? values.startDate
      : quarterDateRange.start
    : undefined;
  const startDateYear = getDateInputYear(values.startDate);
  const endDateYear = getDateInputYear(values.endDate);
  const startDateAssistance =
    startDateYear !== null && startDateYear > 2400
      ? content["form.date.year_hint"]
      : formattedStartDate
        ? content["form.date.selected_be"].replace(
            "{date}",
            formattedStartDate,
          )
        : "";
  const endDateAssistance =
    endDateYear !== null && endDateYear > 2400
      ? content["form.date.year_hint"]
      : formattedEndDate
        ? content["form.date.selected_be"].replace(
            "{date}",
            formattedEndDate,
          )
        : "";
  const currentValidationErrors = validate();
  const visibleDateError = getVisibleActivityDateError(
    {
      fiscalYear: Number(values.fiscalYear),
      quarterNo: Number(values.quarterNo),
      startDate: values.startDate,
      endDate: values.endDate,
      startField: "start_date",
      endField: "end_date",
      startRule: "not_after_today",
    },
    dateFieldsTouched,
  );
  const requiredFields: FieldName[] = [
    "fiscal_year",
    "quarter_no",
    "title",
    "main_department",
    "activity_type_id",
    "participant_type_id",
    "start_date",
    "end_date",
    "total_participants",
    "images",
    "image_consent",
  ];
  const missingRequiredCount = requiredFields.filter(
    (field) => currentValidationErrors[field] || fieldErrors[field],
  ).length;
  const canSave =
    Object.keys(currentValidationErrors).length === 0 &&
    Object.keys(fieldErrors).length === 0;
  const visibleFieldErrors: FieldErrors = withoutDateErrors(fieldErrors);
  if (visibleDateError) {
    visibleFieldErrors[visibleDateError.field] = dateErrorMessage(
      content,
      visibleDateError.key,
      values.fiscalYear,
      values.quarterNo,
    );
  }
  const fieldHasInput = (field: FieldName) => {
    switch (field) {
      case "fiscal_year":
        return Boolean(values.fiscalYear);
      case "quarter_no":
        return Boolean(values.quarterNo);
      case "title":
        return Boolean(values.title);
      case "main_department":
        return Boolean(values.mainDepartment);
      case "co_organizers":
        return values.coOrganizers.length > 0;
      case "activity_type_id":
        return Boolean(values.activityTypeId);
      case "participant_type_id":
        return Boolean(values.participantTypeId);
      case "start_date":
        return Boolean(values.startDate);
      case "end_date":
        return Boolean(values.endDate);
      case "total_participants":
        return Boolean(values.totalParticipants);
      case "images":
        return images.length > 0;
      case "image_consent":
        return values.imageConsent;
      case "result_summary":
        return Boolean(values.resultSummary);
      case "satisfaction_percent":
        return Boolean(values.satisfactionPercent);
      case "location":
        return Boolean(values.location);
      case "ref_link":
        return Boolean(values.refLink);
      case "planned_id":
        return Boolean(values.plannedId);
    }
  };
  for (const field of Object.keys(currentValidationErrors) as FieldName[]) {
    if (!visibleFieldErrors[field] && fieldHasInput(field)) {
      visibleFieldErrors[field] = currentValidationErrors[field];
    }
  }

  return (
    <>
      <ActivityFormHeader
        content={content}
        descriptionKey="form1.description"
        mode={mode}
        number={1}
        onModeChange={(nextMode) => {
          if (nextMode === "planned") {
            setMode("planned");
            loadPlannedActivities(
              values.fiscalYear,
              values.quarterNo,
              values.mainDepartment,
            );
          } else {
            plannedRequest.current?.abort();
            plannedRequest.current = null;
            setMode("new");
            setPlannedActivities([]);
            setPlannedLoading(false);
            setPlannedError("");
            updateValue("plannedId", "");
          }
        }}
        titleKey="form1.title"
      />
      <section className="past-form-card">

      {mode === "planned" ? (
        <div className="planned-picker">
          <label className="past-field-label" htmlFor="planned_id">
            {content["form1.mode.planned"]}
          </label>
          <select
            aria-describedby={fieldErrors.planned_id ? "planned_id-error" : undefined}
            className="past-input"
            disabled={plannedLoading || plannedActivities.length === 0}
            id="planned_id"
            onChange={(event) => selectPlannedActivity(event.currentTarget.value)}
            value={values.plannedId}
          >
            <option value="">{content["form1.planned.placeholder"]}</option>
            {plannedActivities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.title}
              </option>
            ))}
          </select>
          {plannedLoading ? (
            <p className="past-field-help">{content["form1.planned.loading"]}</p>
          ) : plannedError ? (
            <p className="past-field-error" role="alert">
              {plannedError}
            </p>
          ) : plannedActivities.length === 0 ? (
            <p className="past-field-help">{content["form1.planned.empty"]}</p>
          ) : null}
          {fieldErrors.planned_id ? (
            <p className="past-field-error" id="planned_id-error" role="alert">
              {fieldErrors.planned_id}
            </p>
          ) : null}
        </div>
      ) : null}

      <form className="past-form" noValidate onSubmit={submit}>
        <div className="past-form-grid">
          <FormField
            error={visibleFieldErrors.quarter_no}
            gridArea="quarter"
            id="quarter_no"
            label={content["form1.field.quarter"]}
            required
          >
            <select
              aria-describedby={visibleFieldErrors.quarter_no ? "quarter_no-error" : undefined}
              className="past-input"
              id="quarter_no"
              onChange={(event) => {
                const quarterNo = event.currentTarget.value;
                setValues((current) => ({
                  ...current,
                  quarterNo,
                  plannedId: "",
                }));
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next.quarter_no;
                  delete next.planned_id;
                  return next;
                });
                if (mode === "planned") {
                  loadPlannedActivities(
                    values.fiscalYear,
                    quarterNo,
                    values.mainDepartment,
                  );
                }
              }}
              required
              value={values.quarterNo}
            >
              <option value="">{content["form1.select.placeholder"]}</option>
              {quarters.map((quarter) => (
                <option key={quarter.no} value={quarter.no}>
                  {quarter.label_th}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            error={visibleFieldErrors.fiscal_year}
            gridArea="fiscal-year"
            help={content["form1.help.fiscal_year"]}
            id="fiscal_year"
            label={content["form1.field.fiscal_year"]}
            required
          >
            <div className="past-fiscal-year-input">
              <span aria-hidden="true">ปีงบประมาณ</span>
              <input
                aria-describedby={visibleFieldErrors.fiscal_year ? "fiscal_year-error" : quarterDateRangeMessage ? "fiscal_year-help quarter-date-range-help" : "fiscal_year-help"}
                id="fiscal_year"
                max="9999"
                min="1544"
                onChange={(event) => {
                  const fiscalYear = event.currentTarget.value;
                  setValues((current) => ({
                    ...current,
                    fiscalYear,
                    plannedId: "",
                  }));
                  setFieldErrors((current) => {
                    const next = { ...current };
                    delete next.fiscal_year;
                    delete next.planned_id;
                    return next;
                  });
                  if (mode === "planned") {
                    loadPlannedActivities(
                      fiscalYear,
                      values.quarterNo,
                      values.mainDepartment,
                    );
                  }
                }}
                required
                type="number"
                value={values.fiscalYear}
              />
            </div>
            {quarterDateRangeMessage ? (
              <p className="past-field-help" id="quarter-date-range-help">
                {quarterDateRangeMessage}
              </p>
            ) : null}
          </FormField>

          <FormField
            error={visibleFieldErrors.title}
            gridArea="title"
            id="title"
            label={content["form1.field.title"]}
            labelAddon={
              <span className="past-character-count" id="title-count">
                {titleLength}/150
              </span>
            }
            required
          >
            <input
              aria-describedby={visibleFieldErrors.title ? "title-error" : "title-count"}
              className="past-input"
              id="title"
              maxLength={150}
              onChange={(event) => updateValue("title", event.currentTarget.value)}
              placeholder={content["form1.placeholder.title"]}
              required
              type="text"
              value={values.title}
            />
          </FormField>

          <FormField
            error={visibleFieldErrors.main_department}
            gridArea="main-department"
            id="main_department"
            label={content["form1.field.main_department"]}
            required
          >
            <select
              aria-describedby={visibleFieldErrors.main_department ? "main_department-error" : undefined}
              className="past-input"
              disabled={user.role === "unit_user"}
              id="main_department"
              onChange={(event) => {
                const mainDepartment = event.currentTarget.value;
                setValues((current) => ({
                  ...current,
                  ...updateMainDepartment(current, mainDepartment),
                  plannedId: "",
                }));
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next.main_department;
                  delete next.planned_id;
                  return next;
                });
                if (mode === "planned") {
                  loadPlannedActivities(
                    values.fiscalYear,
                    values.quarterNo,
                    mainDepartment,
                  );
                }
              }}
              required
              value={values.mainDepartment}
            >
              <option value="">{content["form1.select.placeholder"]}</option>
              {departments.map((department) => (
                <option key={department.code} value={department.code}>
                  {department.name_th}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            error={visibleFieldErrors.co_organizers}
            gridArea="co-organizers"
            help={content["form1.help.co_organizers"]}
            id="co_organizers"
            label={content["form1.field.co_organizers"]}
            labelAsText
          >
            <div
              aria-describedby={visibleFieldErrors.co_organizers ? "co_organizers-error" : undefined}
              aria-labelledby="co_organizers-label"
              className="co-organizer-chips"
              id="co_organizers"
              role="group"
            >
              {departments.map((department) => {
                const isMainDepartment =
                  department.code === values.mainDepartment;
                const isSelected = values.coOrganizers.includes(
                  department.code,
                );
                return (
                  <button
                    aria-pressed={isSelected}
                    className={`co-organizer-chip${isSelected ? " co-organizer-chip-selected" : ""}${isMainDepartment ? " co-organizer-chip-main" : ""}`}
                    disabled={isMainDepartment}
                    key={department.code}
                    onClick={() => toggleCoOrganizer(department.code)}
                    type="button"
                  >
                    {department.code} - {department.name_th}
                  </button>
                );
              })}
            </div>
          </FormField>

          <FormField
            error={visibleFieldErrors.activity_type_id}
            gridArea="activity-type"
            id="activity_type_id"
            label={content["form1.field.activity_type"]}
            required
          >
            <div className="past-input-with-tooltip">
              <select
                aria-describedby={
                  visibleFieldErrors.activity_type_id
                    ? "activity_type_id-error"
                    : selectedActivityType?.description
                      ? "activity-type-description"
                      : undefined
                }
                className="past-input"
                id="activity_type_id"
                onChange={(event) => {
                  updateValue("activityTypeId", event.currentTarget.value);
                  setActivityTooltipOpen(false);
                }}
                required
                value={values.activityTypeId}
              >
                <option value="">{content["form1.select.placeholder"]}</option>
                {activityTypes.map((activityType) => (
                  <option
                    key={activityType.id}
                    title={activityType.description ?? ""}
                    value={activityType.id}
                  >
                    {activityType.name_th}
                  </option>
                ))}
              </select>
              <button
                aria-describedby={
                  selectedActivityType?.description
                    ? "activity-type-description"
                    : "activity-type-help"
                }
                aria-expanded={activityTooltipOpen}
                aria-label={content["form1.field.activity_type"]}
                className={`past-tooltip-trigger${activityTooltipOpen ? " past-tooltip-open" : ""}`}
                disabled={!selectedActivityType?.description}
                onClick={() =>
                  setActivityTooltipOpen((isOpen) => !isOpen)
                }
                type="button"
              >
                <Info aria-hidden="true" size={16} />
                {selectedActivityType?.description ? (
                  <span
                    className="past-tooltip-bubble"
                    id="activity-type-description"
                    role="tooltip"
                  >
                    {selectedActivityType.description}
                  </span>
                ) : null}
              </button>
            </div>
            <p className="past-field-help" id="activity-type-help">
              {content["form1.help.activity_type"]}
            </p>
          </FormField>

          <FormField
            error={visibleFieldErrors.participant_type_id}
            gridArea="participant-type"
            id="participant_type_id"
            label={content["form1.field.participant_type"]}
            required
          >
            <select
              aria-describedby={visibleFieldErrors.participant_type_id ? "participant_type_id-error" : undefined}
              className="past-input"
              id="participant_type_id"
              onChange={(event) =>
                updateValue("participantTypeId", event.currentTarget.value)
              }
              required
              value={values.participantTypeId}
            >
              <option value="">{content["form1.select.placeholder"]}</option>
              {participantTypes.map((participantType) => (
                <option key={participantType.id} value={participantType.id}>
                  {participantType.name_th}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            error={visibleFieldErrors.start_date}
            gridArea="start-date"
            help={content["form1.help.date_range"]}
            id="start_date"
            label={content["form1.field.start_date"]}
            required
          >
            <input
            aria-describedby={`${visibleFieldErrors.start_date ? "start_date-error" : "start_date-help"}${startDateAssistance ? " start_date-calendar-help" : ""}`}
              className="past-input"
              id="start_date"
            max={startDateMax}
            min={quarterDateRange?.start}
              onChange={(event) => updateValue("startDate", event.currentTarget.value)}
              required
              type="date"
              value={values.startDate}
            />
          {startDateAssistance ? (
            <p className="past-field-help" id="start_date-calendar-help">
              {startDateAssistance}
            </p>
          ) : null}
          </FormField>

          <FormField
            error={visibleFieldErrors.end_date}
            gridArea="end-date"
            help={content["form1.help.date_range"]}
            id="end_date"
            label={content["form1.field.end_date"]}
            required
          >
            <input
            aria-describedby={`${visibleFieldErrors.end_date ? "end_date-error" : "end_date-help"}${endDateAssistance ? " end_date-calendar-help" : ""}`}
              className="past-input"
              id="end_date"
            max={quarterDateRange?.end}
            min={endDateMin}
              onChange={(event) => updateValue("endDate", event.currentTarget.value)}
              required
              type="date"
              value={values.endDate}
            />
          {endDateAssistance ? (
            <p className="past-field-help" id="end_date-calendar-help">
              {endDateAssistance}
            </p>
          ) : null}
          </FormField>

          <FormField
            error={visibleFieldErrors.total_participants}
            gridArea="total-participants"
            help={content["form1.help.participants"]}
            id="total_participants"
            label={content["form1.field.total_participants"]}
            required
          >
            <input
              aria-describedby={visibleFieldErrors.total_participants ? "total_participants-error" : "total_participants-help"}
              className="past-input"
              id="total_participants"
              min="1"
              max="2147483647"
              onChange={(event) =>
                updateValue("totalParticipants", event.currentTarget.value)
              }
              required
              placeholder={content["form1.placeholder.total_participants"]}
              step="1"
              type="number"
              value={values.totalParticipants}
            />
          </FormField>

          <FormField
            error={visibleFieldErrors.result_summary}
            gridArea="result-summary"
            id="result_summary"
            label={content["form1.field.result_summary"]}
          >
            <textarea
              aria-describedby={visibleFieldErrors.result_summary ? "result_summary-error" : "result_summary-count"}
              className="past-input past-textarea"
              id="result_summary"
              maxLength={500}
              onChange={(event) =>
                updateValue("resultSummary", event.currentTarget.value)
              }
              placeholder={content["form1.placeholder.result_summary"]}
              rows={4}
              value={values.resultSummary}
            />
            <p className="past-character-count" id="result_summary-count">
              {resultLength}/500
            </p>
          </FormField>

          <FormField
            error={visibleFieldErrors.satisfaction_percent}
            gridArea="satisfaction"
            help={content["form1.help.satisfaction"]}
            id="satisfaction_percent"
            label={content["form1.field.satisfaction"]}
          >
            <input
              aria-describedby={visibleFieldErrors.satisfaction_percent ? "satisfaction_percent-error" : "satisfaction_percent-help"}
              className="past-input"
              id="satisfaction_percent"
              inputMode="decimal"
              max="100"
              min="0"
              onChange={(event) =>
                updateValue("satisfactionPercent", event.currentTarget.value)
              }
              placeholder={content["form1.placeholder.satisfaction"]}
              step="0.1"
              type="number"
              value={values.satisfactionPercent}
            />
          </FormField>

          <FormField
            error={visibleFieldErrors.location}
            gridArea="location"
            id="location"
            label={content["form1.field.location"]}
          >
            <input
              aria-describedby={visibleFieldErrors.location ? "location-error" : undefined}
              className="past-input"
              id="location"
              maxLength={255}
              onChange={(event) => updateValue("location", event.currentTarget.value)}
              placeholder={content["form1.placeholder.location"]}
              type="text"
              value={values.location}
            />
          </FormField>

          <FormField
            error={visibleFieldErrors.ref_link}
            gridArea="ref-link"
            id="ref_link"
            label={content["form1.field.ref_link"]}
          >
            <input
              aria-describedby={visibleFieldErrors.ref_link ? "ref_link-error" : undefined}
              className="past-input"
              id="ref_link"
              maxLength={500}
              onChange={(event) => updateValue("refLink", event.currentTarget.value)}
              placeholder={content["form1.placeholder.ref_link"]}
              type="url"
              value={values.refLink}
            />
          </FormField>
        </div>

        <FormField
          error={visibleFieldErrors.images}
          id="images"
          label={content["form1.field.images"]}
          required
        >
          <div
            className={`past-upload-dropzone${dragActive ? " past-upload-drag-active" : ""}${images.length >= 5 ? " past-upload-at-limit" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (images.length < 5) {
                setDragActive(true);
              }
            }}
            onDragLeave={() => setDragActive(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              addImages(event.dataTransfer.files);
            }}
          >
            <button
              aria-describedby={
                visibleFieldErrors.images
                  ? "images-help images-error"
                  : "images-help"
              }
              className="upload-drop-trigger"
              disabled={images.length >= 5}
              onClick={() => imageInput.current?.click()}
              type="button"
            >
              <ImagePlus aria-hidden="true" size={27} />
              <span>{content["form1.upload.add"]}</span>
              <span className="upload-count">
                {content["form1.upload.count"].replace(
                  "{count}",
                  String(images.length),
                )}
              </span>
            </button>
            <input
              accept="image/jpeg,image/png"
              aria-hidden="true"
              className="visually-hidden-file"
              disabled={images.length >= 5}
              id="images"
              multiple
              onChange={(event) => {
                addImages(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
              ref={imageInput}
              required
              tabIndex={-1}
              type="file"
            />
          </div>
          <p className="past-field-help" id="images-help">
            {content["form1.upload.requirements"]}
          </p>
          {images.length > 0 ? (
            <div className="past-image-list">
              {images.map(({ file, previewUrl, existingId }, index) => {
                const imageName = file?.name ?? `${content["form1.field.images"]} ${index + 1}`;
                return (
                <figure className="past-image-item" key={existingId ?? previewUrl}>
                  <Image
                    alt={imageName}
                    className="past-image-preview"
                    height={104}
                    src={previewUrl}
                    unoptimized
                    width={148}
                  />
                  <figcaption className="past-image-caption">
                    <span title={imageName}>{imageName}</span>
                    <button
                      aria-label={`${content["form1.upload.remove"]}: ${imageName}`}
                      className="image-remove-button"
                      onClick={() => removeImage(previewUrl)}
                      type="button"
                    >
                      {content["form1.upload.remove"]}
                    </button>
                  </figcaption>
                </figure>
                );
              })}
            </div>
          ) : null}
        </FormField>

        <div className="past-consent-wrap">
          <label className="past-consent-label" htmlFor="image_consent">
            <input
              aria-describedby={visibleFieldErrors.image_consent ? "image_consent-error" : undefined}
              aria-required="true"
              checked={values.imageConsent}
              id="image_consent"
              onChange={(event) =>
                updateValue("imageConsent", event.currentTarget.checked)
              }
              required
              type="checkbox"
            />
            <span className="past-consent-copy">
              <span className="past-consent-main">
                {content["form1.consent"]}
                <span aria-hidden="true" className="required-mark">
                  *
                </span>
              </span>
              <span className="past-consent-help">
                {content["form1.help.consent_minor"]}
              </span>
            </span>
          </label>
          {visibleFieldErrors.image_consent ? (
            <p className="past-field-error" id="image_consent-error" role="alert">
              {visibleFieldErrors.image_consent}
            </p>
          ) : null}
        </div>

        {submitError ? (
          <p className="past-submit-error" role="alert">
            {submitError}
          </p>
        ) : null}
        {saved ? (
          <p className="past-save-success" role="status">
            {content["form1.saved"]}
          </p>
        ) : null}

        <div className="past-form-footer">
          <p aria-live="polite" className="past-incomplete-hint">
            {missingRequiredCount > 0
              ? content["form1.submit.incomplete"].replace(
                  "{count}",
                  String(missingRequiredCount),
                )
              : ""}
          </p>
          <div className="past-form-actions">
            <Link className="secondary-button" href={editId ? "/activities/mine" : "/"}>
              {content["btn.cancel"]}
            </Link>
            <button
              className={`primary-button past-save-button${canSave ? " past-save-ready" : " past-save-disabled"}`}
              disabled={!canSave || saving || saved}
              type="submit"
            >
              <Save aria-hidden="true" size={16} />
              {content["btn.save"]}
            </button>
          </div>
        </div>
      </form>
      </section>
    </>
  );
}

const keyToField: Partial<Record<keyof FormValues, FieldName>> = {
  fiscalYear: "fiscal_year",
  quarterNo: "quarter_no",
  title: "title",
  mainDepartment: "main_department",
  coOrganizers: "co_organizers",
  activityTypeId: "activity_type_id",
  participantTypeId: "participant_type_id",
  startDate: "start_date",
  endDate: "end_date",
  totalParticipants: "total_participants",
  resultSummary: "result_summary",
  satisfactionPercent: "satisfaction_percent",
  imageConsent: "image_consent",
  location: "location",
  refLink: "ref_link",
  plannedId: "planned_id",
};

const fieldErrorsByName: Record<FieldName, true> = {
  fiscal_year: true,
  quarter_no: true,
  title: true,
  main_department: true,
  co_organizers: true,
  activity_type_id: true,
  participant_type_id: true,
  start_date: true,
  end_date: true,
  total_participants: true,
  result_summary: true,
  satisfaction_percent: true,
  images: true,
  image_consent: true,
  location: true,
  ref_link: true,
  planned_id: true,
};
