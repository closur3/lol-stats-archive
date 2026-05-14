import { assertScheduleMetaFields, ensureScheduleMetas } from "../facts/scheduleMetaStore.js";
import { timePolicy } from "../../utils/timePolicy.js";

export async function fetchTournamentMetasFromScheduleMeta(env, tournaments) {
  return ensureScheduleMetas(env, tournaments);
}

export function buildWindowFromMeta(meta) {
  const fields = assertScheduleMetaFields("SCHEDULE_META", meta);
  const hasCarryoverUnfinished = fields.hasHistoryUnfinished;
  const earliest = fields.todayEarliestTimestamp;
  if (!hasCarryoverUnfinished && !earliest) return null;
  return {
    startHour: hasCarryoverUnfinished ? 0 : timePolicy.getBusinessHour(earliest),
    endHour: 23
  };
}
