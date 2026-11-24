import "server-only";

import { getPastActivityFormOptions } from "@/lib/past-activity-data";

export async function getPlannedActivityFormOptions() {
  return getPastActivityFormOptions();
}
