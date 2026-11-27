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
  handleMainDepartmentChange,
} from "@/lib/activity-department";
import type { AuthenticatedUser } from "@/lib/auth";
import type { ContentKey, SiteContent } from "@/lib/content";
import type {
  ActivityTypeOption,
  DepartmentOption,
  ParticipantTypeOption,
  QuarterOption,
} from "@/lib/past-activity-data";
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

interface PlannedActivityFormProps {
  content: SiteContent;
  user: AuthenticatedUser;
  departments: DepartmentOption[];
  activityTypes: ActivityTypeOption[];
  participantTypes: ParticipantTypeOption[];
  quarters: QuarterOption[];
  initialFiscalYear: number;
  initialQuarterNo: number;
  editId?: string;
  initialData?: PlannedActivityInitialData;
}

export interface PlannedActivityInitialData {
  fiscal_year: number;
  quarter_no: number;
  title: string;
  main_department: string;
  co_organizers: string[];
  activity_type_id: number;
  participant_type_id: number;
  date_status: "confirmed" | "unconfirmed";
  expected_start: string;
  expected_end: string;
  expected_participants: number;
  banner_url: string;
  banner_path: string | null;
  location: string;
  ref_link: string;
}

interface FormValues {
  fiscalYear: string;
  quarterNo: string;
  title: string;
  mainDepartment: string;
  coOrganizers: string[];
  activityTypeId: string;
  participantTypeId: string;
  dateStatus: "" | "confirmed" | "unconfirmed";
  expectedStart: string;
  expectedEnd: string;
  expectedParticipants: string;
  location: string;
  refLink: string;
}

type FieldName =
  | "fiscal_year"
  | "quarter_no"
  | "title"
  | "main_department"
  | "co_organizers"
  | "activity_type_id"
  | "participant_type_id"
  | "date_status"
  | "expected_start"
  | "expected_end"
  | "expected_participants"
  | "banner"
  | "location"
  | "ref_link";

type FieldErrors = Partial<Record<FieldName, string>>;
type DateFieldName = "expected_start" | "expected_end";

function withoutDateErrors(errors: FieldErrors): FieldErrors {
  const next = { ...errors };
  delete next.expected_start;
  delete next.expected_end;
  return next;
}

function dateErrorMessage(
  content: SiteContent,
  key: unknown,
  fiscalYear: string,
  quarterNo: string,
): string {
  const message =
    typeof key === "string" && Object.hasOwn(content, key)
      ? content[key as ContentKey]
      : content["err.save"];
  return key === "err.date.quarter"
    ? formatQuarterDateError(
        message,
        Number(fiscalYear),
        Number(quarterNo),
        content["form.date.quarter_range"],
      )
    : message;
}

const plannedKeyToField: Partial<Record<keyof FormValues, FieldName>> = {
  fiscalYear: "fiscal_year",
  quarterNo: "quarter_no",
  title: "title",
  mainDepartment: "main_department",
  coOrganizers: "co_organizers",
  activityTypeId: "activity_type_id",
  participantTypeId: "participant_type_id",
  dateStatus: "date_status",
  expectedStart: "expected_start",
  expectedEnd: "expected_end",
  expectedParticipants: "expected_participants",
  location: "location",
  refLink: "ref_link",
};

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
          <label className="past-field-label" htmlFor={id} id={`${id}-label`}>
            {label}
            {required ? (
              <span aria-hidden="true" className="required-mark">*</span>
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

export function PlannedActivityForm({
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
}: PlannedActivityFormProps) {
  const router = useRouter();
  const bannerInput = useRef<HTMLInputElement>(null);
  const bannerPreviewUrl = useRef<string | null>(null);
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
    dateStatus: initialData?.date_status ?? "",
    expectedStart: initialData?.expected_start ?? "",
    expectedEnd: initialData?.expected_end ?? "",
    expectedParticipants: initialData
      ? String(initialData.expected_participants)
      : "",
    location: initialData?.location ?? "",
    refLink: initialData?.ref_link ?? "",
  });
  const [banner, setBanner] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState(initialData?.banner_url ?? "");
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dateFieldsTouched, setDateFieldsTouched] = useState<
    Partial<Record<DateFieldName, boolean>>
  >({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [activityTooltipOpen, setActivityTooltipOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (bannerPreviewUrl.current) {
        URL.revokeObjectURL(bannerPreviewUrl.current);
      }
    };
  }, []);

  function updateValue<K extends keyof FormValues>(
    key: K,
    value: FormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      const field = plannedKeyToField[key];
      if (field) delete next[field];
      return next;
    });
    const field = plannedKeyToField[key];
    if (field === "expected_start" || field === "expected_end") {
      setDateFieldsTouched((current) => {
        const next = { ...current };
        if (field === "expected_start") next.expected_start = true;
        else next.expected_end = true;
        return next;
      });
    }
  }

  function toggleCoOrganizer(departmentCode: string) {
    if (departmentCode === values.mainDepartment) return;
    setValues((current) => ({
      ...current,
      coOrganizers: current.coOrganizers.includes(departmentCode)
        ? current.coOrganizers.filter((code) => code !== departmentCode)
        : [...current.coOrganizers, departmentCode],
    }));
  }

  function setBannerFile(file: File | null) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.banner;
      return next;
    });
    if (!file) return;
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setFieldErrors((current) => ({
        ...current,
        banner: content["err.image.type"],
      }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors((current) => ({
        ...current,
        banner: content["err.image.size"],
      }));
      return;
    }
    if (bannerPreviewUrl.current) {
      URL.revokeObjectURL(bannerPreviewUrl.current);
    }
    const previewUrl = URL.createObjectURL(file);
    bannerPreviewUrl.current = previewUrl;
    setBanner(file);
    setBannerPreview(previewUrl);
    setBannerRemoved(false);
  }

  function removeBanner() {
    if (bannerPreviewUrl.current) {
      URL.revokeObjectURL(bannerPreviewUrl.current);
      bannerPreviewUrl.current = null;
    }
    setBanner(null);
    setBannerPreview("");
    setBannerRemoved(true);
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!values.fiscalYear) errors.fiscal_year = content["err.required"];
    if (!values.quarterNo) errors.quarter_no = content["err.required"];
    if (!values.title) errors.title = content["err.required"];
    if ([...values.title].length > 150) {
      errors.title = content["err.title.max"];
    }
    if (!values.mainDepartment) {
      errors.main_department = content["err.required"];
    }
    if (!values.activityTypeId) {
      errors.activity_type_id = content["err.required"];
    }
    if (!values.participantTypeId) {
      errors.participant_type_id = content["err.required"];
    }
    if (!values.dateStatus) {
      errors.date_status = content["err.required"];
    }
    if (!values.expectedStart) {
      errors.expected_start = content["err.required"];
    }
    if (!values.expectedEnd) {
      errors.expected_end = content["err.required"];
    }
    if (!values.expectedParticipants) {
      errors.expected_participants = content["err.required"];
    }
    if (values.location && [...values.location].length > 255) {
      errors.location = content["err.location.max"];
    }
    if (values.refLink && [...values.refLink].length > 500) {
      errors.ref_link = content["err.ref_link.max"];
    }
    const participants = Number(values.expectedParticipants);
    if (
      values.expectedParticipants &&
      (!Number.isInteger(participants) || participants < 1)
    ) {
      errors.expected_participants = content["err.participants.min"];
    }
    if (new Set(values.coOrganizers).size !== values.coOrganizers.length) {
      errors.co_organizers = content["err.co.duplicate"];
    } else if (values.coOrganizers.includes(values.mainDepartment)) {
      errors.co_organizers = content["err.co.duplicate"];
    } else if (values.coOrganizers.length > 7) {
      errors.co_organizers = content["err.co.max"];
    }
    const dateError = validateActivityDates({
      fiscalYear: Number(values.fiscalYear),
      quarterNo: Number(values.quarterNo),
      startDate: values.expectedStart,
      endDate: values.expectedEnd,
      startField: "expected_start",
      endField: "expected_end",
      startRule: editId ? "none" : "not_before_today",
    });
    if (dateError && !errors[dateError.field]) {
      errors[dateError.field] = dateErrorMessage(
        content,
        dateError.key,
        values.fiscalYear,
        values.quarterNo,
      );
    }
    if (
      banner &&
      (banner.type !== "image/jpeg" && banner.type !== "image/png")
    ) {
      errors.banner = content["err.image.type"];
    } else if (banner && banner.size > 5 * 1024 * 1024) {
      errors.banner = content["err.image.size"];
    }
    return errors;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    const errors = validate();
    setFieldErrors(withoutDateErrors(errors));
    setDateFieldsTouched({ expected_start: true, expected_end: true });
    if (Object.keys(errors).length > 0) return;

    const formData = new FormData();
    formData.set("fiscal_year", values.fiscalYear);
    formData.set("quarter_no", values.quarterNo);
    formData.set("title", values.title);
    formData.set("main_department", values.mainDepartment);
    formData.set("co_organizers", JSON.stringify(values.coOrganizers));
    formData.set("activity_type_id", values.activityTypeId);
    formData.set("participant_type_id", values.participantTypeId);
    formData.set("date_status", values.dateStatus);
    formData.set("expected_start", values.expectedStart);
    formData.set("expected_end", values.expectedEnd);
    formData.set("expected_participants", values.expectedParticipants);
    formData.set("location", values.location);
    formData.set("ref_link", values.refLink);
    if (banner) formData.set("banner", banner);

    setSaving(true);
    try {
      if (bannerRemoved) formData.set("remove_banner", "1");
      const response = await fetch(
        editId ? `/api/activities/planned/${editId}` : "/api/activities/planned",
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
        const key = typeof errorKey === "string" ? errorKey : "err.save";
        const message = dateErrorMessage(
          content,
          key,
          values.fiscalYear,
          values.quarterNo,
        );
        if (typeof field === "string") {
          if (field === "expected_start" || field === "expected_end") {
            setDateFieldsTouched((current) => ({ ...current, [field]: true }));
          } else {
            setFieldErrors((current) => ({ ...current, [field]: message }));
          }
        } else {
          setSubmitError(message);
        }
        return;
      }
      setSaved(true);
      window.setTimeout(
        () => router.replace(editId ? "/activities/mine?type=planned" : "/"),
        1400,
      );
    } catch {
      setSubmitError(content["err.save"]);
    } finally {
      setSaving(false);
    }
  }

  const titleLength = [...values.title].length;
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
  const plannedStartMin = quarterDateRange
    ? editId
      ? quarterDateRange.start
      : quarterDateRange.start > today
        ? quarterDateRange.start
        : today
    : undefined;
  const formattedExpectedStart = formatBuddhistCalendarDate(
    values.expectedStart,
  );
  const formattedExpectedEnd = formatBuddhistCalendarDate(values.expectedEnd);
  const validStartDate = Boolean(
    quarterDateRange &&
      formattedExpectedStart &&
      values.expectedStart >= quarterDateRange.start &&
      values.expectedStart <= quarterDateRange.end,
  );
  const expectedEndMin = quarterDateRange
    ? validStartDate && values.expectedStart > quarterDateRange.start
      ? values.expectedStart
      : quarterDateRange.start
    : undefined;
  const expectedStartYear = getDateInputYear(values.expectedStart);
  const expectedEndYear = getDateInputYear(values.expectedEnd);
  const expectedStartAssistance =
    expectedStartYear !== null && expectedStartYear > 2400
      ? content["form.date.year_hint"]
      : formattedExpectedStart
        ? content["form.date.selected_be"].replace(
            "{date}",
            formattedExpectedStart,
          )
        : "";
  const expectedEndAssistance =
    expectedEndYear !== null && expectedEndYear > 2400
      ? content["form.date.year_hint"]
      : formattedExpectedEnd
        ? content["form.date.selected_be"].replace(
            "{date}",
            formattedExpectedEnd,
          )
        : "";
  const currentValidationErrors = validate();
  const visibleDateError = getVisibleActivityDateError(
    {
      fiscalYear: Number(values.fiscalYear),
      quarterNo: Number(values.quarterNo),
      startDate: values.expectedStart,
      endDate: values.expectedEnd,
      startField: "expected_start",
      endField: "expected_end",
      startRule: editId ? "none" : "not_before_today",
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
    "date_status",
    "expected_start",
    "expected_end",
    "expected_participants",
  ];
  const missingRequiredCount = requiredFields.filter(
    (field) => currentValidationErrors[field],
  ).length;
  const canSave =
    Object.keys(currentValidationErrors).length === 0 &&
    Object.keys(fieldErrors).length === 0;

  const visibleFieldErrors = withoutDateErrors(fieldErrors);
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
      case "date_status":
        return Boolean(values.dateStatus);
      case "expected_start":
        return Boolean(values.expectedStart);
      case "expected_end":
        return Boolean(values.expectedEnd);
      case "expected_participants":
        return Boolean(values.expectedParticipants);
      case "banner":
        return Boolean(banner);
      case "location":
        return Boolean(values.location);
      case "ref_link":
        return Boolean(values.refLink);
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
        descriptionKey="form2.description"
        number={2}
        titleKey="form2.title"
      />
      <section className="past-form-card">

      <form className="past-form" noValidate onSubmit={submit}>
        <div className="past-form-grid planned-form-grid">
          <FormField error={visibleFieldErrors.quarter_no} gridArea="quarter" id="quarter_no" label={content["form1.field.quarter"]} required>
            <select aria-describedby={visibleFieldErrors.quarter_no ? "quarter_no-error" : undefined} className="past-input" id="quarter_no" onChange={(event) => updateValue("quarterNo", event.currentTarget.value)} value={values.quarterNo} required>
              <option value="">{content["form1.select.placeholder"]}</option>
              {quarters.map((quarter) => <option key={quarter.no} value={quarter.no}>{quarter.label_th}</option>)}
            </select>
          </FormField>

          <FormField error={visibleFieldErrors.fiscal_year} gridArea="fiscal-year" help={content["form1.help.fiscal_year"]} id="fiscal_year" label={content["form1.field.fiscal_year"]} required>
            <div className="past-fiscal-year-input">
              <span aria-hidden="true">ปีงบประมาณ</span>
              <input aria-describedby={visibleFieldErrors.fiscal_year ? "fiscal_year-error" : quarterDateRangeMessage ? "fiscal_year-help quarter-date-range-help" : "fiscal_year-help"} id="fiscal_year" max="9999" min="1544" onChange={(event) => updateValue("fiscalYear", event.currentTarget.value)} type="number" value={values.fiscalYear} required />
            </div>
            {quarterDateRangeMessage ? <p className="past-field-help" id="quarter-date-range-help">{quarterDateRangeMessage}</p> : null}
          </FormField>

          <FormField error={visibleFieldErrors.title} gridArea="title" id="title" label={content["form1.field.title"]} labelAddon={<span className="past-character-count">{titleLength}/150</span>} required>
            <input aria-describedby={visibleFieldErrors.title ? "title-error" : "title-count"} className="past-input" id="title" maxLength={150} onChange={(event) => updateValue("title", event.currentTarget.value)} placeholder={content["form1.placeholder.title"]} type="text" value={values.title} required />
          </FormField>

          <FormField error={visibleFieldErrors.main_department} gridArea="main-department" id="main_department" label={content["form1.field.main_department"]} required>
            <select aria-describedby={visibleFieldErrors.main_department ? "main_department-error" : undefined} className="past-input" disabled={user.role === "unit_user"} id="main_department" onChange={(event) => handleMainDepartmentChange(event, setValues)} value={values.mainDepartment} required>
              <option value="">{content["form1.select.placeholder"]}</option>
              {departments.map((department) => <option disabled={department.inactive && department.code !== values.mainDepartment} key={department.code} value={department.code}>{department.name_th}</option>)}
            </select>
          </FormField>

          <FormField error={visibleFieldErrors.co_organizers} gridArea="co-organizers" help={content["form1.help.co_organizers"]} id="co_organizers" label={content["form1.field.co_organizers"]} labelAsText>
            <div aria-labelledby="co_organizers-label" className="co-organizer-chips" id="co_organizers" role="group">
              {departments.map((department) => {
                const isMain = department.code === values.mainDepartment;
                const isSelected = values.coOrganizers.includes(department.code);
                return (
                  <button aria-pressed={isSelected} className={`co-organizer-chip${isSelected ? " co-organizer-chip-selected" : ""}${isMain ? " co-organizer-chip-main" : ""}`} disabled={isMain || (department.inactive && !isSelected)} key={department.code} onClick={() => toggleCoOrganizer(department.code)} type="button">
                    {department.code} - {department.name_th}
                  </button>
                );
              })}
            </div>
          </FormField>

          <FormField error={visibleFieldErrors.activity_type_id} gridArea="activity-type" id="activity_type_id" label={content["form1.field.activity_type"]} required>
            <div className="past-input-with-tooltip">
              <select aria-describedby={visibleFieldErrors.activity_type_id ? "activity_type_id-error" : "activity-type-help"} className="past-input" id="activity_type_id" onChange={(event) => { updateValue("activityTypeId", event.currentTarget.value); setActivityTooltipOpen(false); }} value={values.activityTypeId} required>
                <option value="">{content["form1.select.placeholder"]}</option>
                {activityTypes.map((activityType) => <option disabled={activityType.inactive && String(activityType.id) !== values.activityTypeId} key={activityType.id} value={activityType.id}>{activityType.name_th}</option>)}
              </select>
              <button aria-describedby={selectedActivityType?.description ? "activity-type-description" : "activity-type-help"} aria-expanded={activityTooltipOpen} aria-label={content["form1.field.activity_type"]} className={`past-tooltip-trigger${activityTooltipOpen ? " past-tooltip-open" : ""}`} disabled={!selectedActivityType?.description} onClick={() => setActivityTooltipOpen((isOpen) => !isOpen)} type="button">
                <Info aria-hidden="true" size={16} />
                {selectedActivityType?.description ? <span className="past-tooltip-bubble" id="activity-type-description" role="tooltip">{selectedActivityType.description}</span> : null}
              </button>
            </div>
            <p className="past-field-help" id="activity-type-help">{content["form1.help.activity_type"]}</p>
          </FormField>

          <FormField error={visibleFieldErrors.participant_type_id} gridArea="participant-type" id="participant_type_id" label={content["form1.field.participant_type"]} required>
            <select aria-describedby={visibleFieldErrors.participant_type_id ? "participant_type_id-error" : undefined} className="past-input" id="participant_type_id" onChange={(event) => updateValue("participantTypeId", event.currentTarget.value)} value={values.participantTypeId} required>
              <option value="">{content["form1.select.placeholder"]}</option>
              {participantTypes.map((participantType) => <option disabled={participantType.inactive && String(participantType.id) !== values.participantTypeId} key={participantType.id} value={participantType.id}>{participantType.name_th}</option>)}
            </select>
          </FormField>

          <FormField error={visibleFieldErrors.date_status} gridArea="date-status" id="date_status" label={content["form2.field.date_status"]} required>
            <select className="past-input" id="date_status" onChange={(event) => updateValue("dateStatus", event.currentTarget.value as FormValues["dateStatus"])} value={values.dateStatus} required>
              <option value="">{content["form1.select.placeholder"]}</option>
              <option value="confirmed">{content["form2.status.confirmed"]}</option>
              <option value="unconfirmed">{content["form2.status.unconfirmed"]}</option>
            </select>
          </FormField>

          <FormField error={visibleFieldErrors.expected_start} gridArea="start-date" help={content["form1.help.date_range"]} id="expected_start" label={content["form2.field.expected_start"]} required>
            <input aria-describedby={`${visibleFieldErrors.expected_start ? "expected_start-error" : "expected_start-help"}${expectedStartAssistance ? " expected_start-calendar-help" : ""}`} className="past-input" id="expected_start" max={quarterDateRange?.end} min={plannedStartMin} onChange={(event) => updateValue("expectedStart", event.currentTarget.value)} type="date" value={values.expectedStart} required />
            {expectedStartAssistance ? <p className="past-field-help" id="expected_start-calendar-help">{expectedStartAssistance}</p> : null}
          </FormField>

          <FormField error={visibleFieldErrors.expected_end} gridArea="end-date" help={content["form1.help.date_range"]} id="expected_end" label={content["form2.field.expected_end"]} required>
            <input aria-describedby={`${visibleFieldErrors.expected_end ? "expected_end-error" : "expected_end-help"}${expectedEndAssistance ? " expected_end-calendar-help" : ""}`} className="past-input" id="expected_end" max={quarterDateRange?.end} min={expectedEndMin} onChange={(event) => updateValue("expectedEnd", event.currentTarget.value)} type="date" value={values.expectedEnd} required />
            {expectedEndAssistance ? <p className="past-field-help" id="expected_end-calendar-help">{expectedEndAssistance}</p> : null}
          </FormField>

          <FormField error={visibleFieldErrors.expected_participants} gridArea="participants" help={content["form2.help.expected_participants"]} id="expected_participants" label={content["form2.field.expected_participants"]} required>
            <input aria-describedby={visibleFieldErrors.expected_participants ? "expected_participants-error" : "expected_participants-help"} className="past-input" id="expected_participants" min="1" max="2147483647" onChange={(event) => updateValue("expectedParticipants", event.currentTarget.value)} placeholder={content["form2.placeholder.expected_participants"]} step="1" type="number" value={values.expectedParticipants} required />
          </FormField>

          <FormField error={visibleFieldErrors.location} gridArea="location" id="location" label={content["form1.field.location"]}>
            <input className="past-input" id="location" maxLength={255} onChange={(event) => updateValue("location", event.currentTarget.value)} placeholder={content["form1.placeholder.location"]} type="text" value={values.location} />
          </FormField>

          <FormField error={visibleFieldErrors.ref_link} gridArea="ref-link" id="ref_link" label={content["form1.field.ref_link"]}>
            <input className="past-input" id="ref_link" maxLength={500} onChange={(event) => updateValue("refLink", event.currentTarget.value)} placeholder={content["form1.placeholder.ref_link"]} type="url" value={values.refLink} />
          </FormField>
        </div>

        <FormField error={visibleFieldErrors.banner} id="banner" label={content["form2.field.banner"]}>
          <div className={`past-banner-dropzone${dragActive ? " past-upload-drag-active" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setDragActive(false); setBannerFile(event.dataTransfer.files.item(0)); }}>
            {bannerPreview ? (
              <div className="planned-banner-preview">
                <Image alt={content["form2.upload.preview"]} fill sizes="(max-width: 760px) 100vw, 720px" src={bannerPreview} unoptimized />
                <button className="image-remove-button planned-banner-remove" onClick={removeBanner} type="button">{content["form2.upload.remove"]}</button>
              </div>
            ) : (
              <button className="upload-drop-trigger planned-banner-trigger" onClick={() => bannerInput.current?.click()} type="button">
                <ImagePlus aria-hidden="true" size={27} />
                <span>{content["form2.upload.add"]}</span>
              </button>
            )}
            <input accept="image/jpeg,image/png" aria-hidden="true" className="visually-hidden-file" id="banner" onChange={(event) => { setBannerFile(event.currentTarget.files?.item(0) ?? null); event.currentTarget.value = ""; }} ref={bannerInput} tabIndex={-1} type="file" />
          </div>
          <p className="past-field-help" id="banner-help">{content["form2.help.banner"]}</p>
        </FormField>

        {submitError ? <p className="past-submit-error" role="alert">{submitError}</p> : null}
        {saved ? <p className="past-save-success" role="status">{content["form2.saved"]}</p> : null}

        <div className="past-form-footer">
          <p aria-live="polite" className="past-incomplete-hint">
            {missingRequiredCount > 0 ? content["form2.submit.incomplete"].replace("{count}", String(missingRequiredCount)) : ""}
          </p>
          <div className="past-form-actions">
            <Link className="secondary-button" href={editId ? "/activities/mine" : "/"}>{content["btn.cancel"]}</Link>
            <button className={`primary-button past-save-button${canSave ? " past-save-ready" : " past-save-disabled"}`} disabled={!canSave || saving || saved} type="submit">
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
