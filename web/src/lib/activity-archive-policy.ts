export type ArchiveAction = "archive" | "restore" | "purge";
export type ArchiveState = "active" | "archived" | "purged" | "invalid";

export function getArchiveState(deletedAt: unknown, purgedAt: unknown): ArchiveState {
  if (purgedAt !== null && purgedAt !== undefined) return "purged";
  if (deletedAt === null || deletedAt === undefined) return "active";
  return "archived";
}

export function canTransitionArchiveState(state: ArchiveState, action: ArchiveAction): boolean {
  if (action === "archive") return state === "active";
  return state === "archived";
}

export function nextArchiveState(action: ArchiveAction): ArchiveState {
  if (action === "archive") return "archived";
  if (action === "restore") return "active";
  return "purged";
}

export function archiveSqlState(action: ArchiveAction) {
  if (action === "archive") {
    return { setClause: "deleted_at = CURRENT_TIMESTAMP", whereClause: "deleted_at IS NULL AND purged_at IS NULL" };
  }
  if (action === "restore") {
    return { setClause: "deleted_at = NULL", whereClause: "deleted_at IS NOT NULL AND purged_at IS NULL" };
  }
  return { setClause: "purged_at = CURRENT_TIMESTAMP", whereClause: "deleted_at IS NOT NULL AND purged_at IS NULL" };
}
