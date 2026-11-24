import "server-only";

import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";

export interface DepartmentOption {
  code: string;
  name_th: string;
}

export interface ActivityTypeOption {
  id: number;
  name_th: string;
  description: string | null;
}

export interface ParticipantTypeOption {
  id: number;
  name_th: string;
}

export interface QuarterOption {
  no: number;
  label_th: string;
}

interface DepartmentRow extends RowDataPacket, DepartmentOption {}
interface ActivityTypeRow extends RowDataPacket, ActivityTypeOption {}
interface ParticipantTypeRow extends RowDataPacket, ParticipantTypeOption {}
interface QuarterRow extends RowDataPacket, QuarterOption {}

export async function getPastActivityFormOptions() {
  const db = getDb();
  const [departments, activityTypes, participantTypes, quarters] =
    await Promise.all([
      db.execute<DepartmentRow[]>(
        "SELECT code, name_th FROM departments WHERE is_active = 1 ORDER BY sort_no, code",
        [],
      ),
      db.execute<ActivityTypeRow[]>(
        "SELECT id, name_th, description FROM activity_types WHERE is_active = 1 ORDER BY sort_no, id",
        [],
      ),
      db.execute<ParticipantTypeRow[]>(
        "SELECT id, name_th FROM participant_types WHERE is_active = 1 ORDER BY sort_no, id",
        [],
      ),
      db.execute<QuarterRow[]>(
        "SELECT no, label_th FROM quarters ORDER BY no",
        [],
      ),
    ]);

  return {
    departments: departments[0].map(({ code, name_th }) => ({ code, name_th })),
    activityTypes: activityTypes[0].map(
      ({ id, name_th, description }) => ({ id, name_th, description }),
    ),
    participantTypes: participantTypes[0].map(({ id, name_th }) => ({
      id,
      name_th,
    })),
    quarters: quarters[0].map(({ no, label_th }) => ({ no, label_th })),
  };
}
