import { readScheduleMetas } from "../facts/scheduleMetaStore.js";
import { timePolicy } from "../../utils/timePolicy.js";

export async function fetchTournamentMetasFromScheduleMeta(env, tournaments) {
  return readScheduleMetas(env, tournaments);
}

export function buildWindowFromMeta(meta) {
  const hasCarryoverUnfinished = !!meta?.hasHistoryUnfinished;
  const earliest = Number(meta?.todayEarliestTimestamp) || 0;
  if (!hasCarryoverUnfinished && !earliest) return null;
  return {
    startHour: hasCarryoverUnfinished ? 0 : timePolicy.getBusinessHour(earliest),
    endHour: 23
  };
}
