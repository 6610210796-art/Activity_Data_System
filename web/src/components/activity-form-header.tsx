import Link from "next/link";
import { ArrowLeft, ListChecks, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import type { ContentKey, SiteContent } from "@/lib/content";

interface ActivityFormHeaderProps {
  content: SiteContent;
  number?: 1 | 2;
  titleKey: ContentKey;
  descriptionKey: ContentKey;
  rightAction?: ReactNode;
  mode?: "planned" | "new";
  onModeChange?: (mode: "planned" | "new") => void;
  plannedModeLabel?: ReactNode;
  newModeLabel?: ReactNode;
}

export function ActivityFormHeader({
  content,
  number,
  titleKey,
  descriptionKey,
  rightAction,
  mode,
  onModeChange,
  plannedModeLabel,
  newModeLabel,
}: ActivityFormHeaderProps) {
  return (
    <section className="activity-form-header">
      <div className="activity-form-header-main">
        {number ? (
          <div
            className={`activity-form-number${number === 2 ? " activity-form-number-green" : ""}`}
            aria-hidden="true"
          >
            {number}
          </div>
        ) : null}
        <div className="activity-form-header-copy">
          <h1>{content[titleKey]}</h1>
          <p>{content[descriptionKey]}</p>
          {mode && onModeChange ? (
            <div
              aria-label={content[titleKey]}
              className="activity-form-mode-switch"
              role="tablist"
            >
              <button
                aria-selected={mode === "planned"}
                className={mode === "planned" ? "activity-form-mode activity-form-mode-selected" : "activity-form-mode"}
                onClick={() => onModeChange("planned")}
                role="tab"
                type="button"
              >
                <ListChecks aria-hidden="true" size={16} />
                {plannedModeLabel ?? content["form1.mode.planned"]}
              </button>
              <button
                aria-selected={mode === "new"}
                className={mode === "new" ? "activity-form-mode activity-form-mode-selected" : "activity-form-mode"}
                onClick={() => onModeChange("new")}
                role="tab"
                type="button"
              >
                <Pencil aria-hidden="true" size={15} />
                {newModeLabel ?? content["form1.mode.new"]}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {rightAction ?? (
        <Link className="activity-form-back-button" href="/activities/mine">
          <ArrowLeft aria-hidden="true" size={16} />
          {content["common.back_to_list"]}
        </Link>
      )}
    </section>
  );
}
