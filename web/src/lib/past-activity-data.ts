import "server-only";

import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";
import {
  getActivityOptionSets,
  type PreviousOptionValues,
} from "@/lib/option-queries";

export interface DepartmentOption {
  code: string;
  name_th: string;
  inactive: boolean;
}

export interface ActivityTypeOption {
  id: number;
  name_th: string;
  description: string | null;
  inactive: boolean;
}

export interface ParticipantTypeOption {
  id: number;
  name_th: string;
  inactive: boolean;
}

export interface QuarterOption {
  no: number;
  label_th: string;
}

interface QuarterRow extends RowDataPacket, QuarterOption {}

export async function getPastActivityFormOptions(
  mode: "create" | "edit" | "filter" = "create",
  inactiveSuffix = "",
  previous: PreviousOptionValues = {},
) {
  const [options, quarters] = await Promise.all([
    getActivityOptionSets(mode, inactiveSuffix, previous),
    getDb().execute<QuarterRow[]>("SELECT no, label_th FROM quarters ORDER BY no", []),
  ]);

  return {
    departments: options.departments.map((option) => ({
      code: option.value,
      name_th: option.label,
      inactive: option.inactive,
    })),
    activityTypes: options.activityTypes.map((option) => ({
      id: Number(option.value),
      name_th: option.label,
      description: option.description || null,
      inactive: option.inactive,
    })),
    participantTypes: options.participantTypes.map((option) => ({
      id: Number(option.value),
      name_th: option.label,
      inactive: option.inactive,
    })),
    quarters: quarters[0].map(({ no, label_th }) => ({ no, label_th })),
  };
}
