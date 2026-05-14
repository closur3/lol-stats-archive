import { assertLeagueState, hasPlayWindow, isNowInPlayWindow } from "./scheduleState.js";
import { timePolicy } from "../../utils/timePolicy.js";

export const IDLE_SWEEP_CRON = "0 */2 * * *";

const MAX_ACTIVE_CRONS = 4;
const MAX_TOTAL_CRONS = 5;
const CRON_DAY_ORDER = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function toActiveCron(startHour, endHour, day) {
  return `2-58/2 ${startHour}-${endHour} * * ${day}`;
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => CRON_DAY_ORDER[a.day] - CRON_DAY_ORDER[b.day] || a.startHour - b.startHour || a.endHour - b.endHour);
  const merged = [];

  for (const interval of sorted) {
    const last = merged.at(-1);
    if (!last || last.day !== interval.day || interval.startHour > last.endHour + 1) {
      merged.push({ day: interval.day, startHour: interval.startHour, endHour: interval.endHour });
      continue;
    }
    last.endHour = Math.max(last.endHour, interval.endHour);
  }

  while (merged.length > MAX_ACTIVE_CRONS) {
    let mergeIndex = 0;
    let bestGap = Infinity;
    for (let index = 0; index < merged.length - 1; index++) {
      if (merged[index].day !== merged[index + 1].day) continue;
      const gap = merged[index + 1].startHour - merged[index].endHour - 1;
      if (gap < bestGap) {
        bestGap = gap;
        mergeIndex = index;
      }
    }
    if (bestGap === Infinity) {
      throw new Error(`Cloudflare active cron limit exceeded: ${merged.length}/${MAX_ACTIVE_CRONS}`);
    }
    merged.splice(mergeIndex, 2, {
      day: merged[mergeIndex].day,
      startHour: merged[mergeIndex].startHour,
      endHour: Math.max(merged[mergeIndex].endHour, merged[mergeIndex + 1].endHour)
    });
  }

  return merged;
}

export function buildActiveBucketCronsFromState(state) {
  if (!state?.leagues || typeof state.leagues !== "object" || Array.isArray(state.leagues)) {
    throw new Error("SCHEDULE_DAY.leagues must be a JSON object");
  }
  const intervals = [];
  for (const [slug, leagueState] of Object.entries(state.leagues)) {
    assertLeagueState(slug, leagueState);
    if (!hasPlayWindow(leagueState)) continue;
    intervals.push(...timePolicy.businessWindowToUtcCronSegments(state.date, leagueState.playStartHour, leagueState.playEndHour));
  }

  const buckets = mergeIntervals(intervals);
  return buckets.map(bucket => toActiveCron(bucket.startHour, bucket.endHour, bucket.day));
}

export function collectSchedulesFromState(state) {
  const activeCrons = buildActiveBucketCronsFromState(state);
  const schedules = Array.from(new Set([IDLE_SWEEP_CRON, ...activeCrons]));
  if (schedules.length > MAX_TOTAL_CRONS) {
    throw new Error(`Cloudflare cron limit exceeded: ${schedules.length}/${MAX_TOTAL_CRONS}`);
  }
  return schedules;
}

export function shouldRunPlayLeagueAt(leagueState, nowUtc) {
  if (!hasPlayWindow(leagueState)) return false;
  return isNowInPlayWindow(leagueState, nowUtc);
}
