import "server-only";

import { getPastActivityFormOptions } from "@/lib/past-activity-data";
import type { PreviousOptionValues } from "@/lib/option-queries";

export function getPlannedActivityFormOptions(
  mode: "create" | "edit" | "filter" = "create",
  inactiveSuffix = "",
  previous: PreviousOptionValues = {},
) {
  return getPastActivityFormOptions(mode, inactiveSuffix, previous);
}
