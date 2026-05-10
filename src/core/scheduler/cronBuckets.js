import { assertLeagueState, hasPlayWindow, isNowInPlayWindow } from "./scheduleState.js";

export const IDLE_SWEEP_CRON = "0 */2 * * *";

const WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MAX_ACTIVE_CRONS = 4;
const MAX_TOTAL_CRONS = 5;

function toActiveCron(startHour, endHour, nowUtc) {
  const day = WEEKDAY[nowUtc.getUTCDay()];
  return `1-59/2 ${startHour}-${endHour} * * ${day}`;
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);
  const merged = [];

  for (const interval of sorted) {
    const last = merged.at(-1);
    if (!last || interval.startHour > last.endHour) {
      merged.push({ startHour: interval.startHour, endHour: interval.endHour });
      continue;
    }
    last.endHour = Math.max(last.endHour, interval.endHour);
  }

  while (merged.length > MAX_ACTIVE_CRONS) {
    let mergeIndex = 0;
    let bestGap = Infinity;
    for (let index = 0; index < merged.length - 1; index++) {
      const gap = merged[index + 1].startHour - merged[index].endHour - 1;
      if (gap < bestGap) {
        bestGap = gap;
        mergeIndex = index;
      }
    }
    merged.splice(mergeIndex, 2, {
      startHour: merged[mergeIndex].startHour,
      endHour: Math.max(merged[mergeIndex].endHour, merged[mergeIndex + 1].endHour)
    });
  }

  return merged;
}

export function buildActiveBucketCronsFromState(state, nowUtc) {
  const intervals = [];
  for (const [slug, leagueState] of Object.entries(state.leagues || {})) {
    assertLeagueState(slug, leagueState);
    if (!hasPlayWindow(leagueState)) continue;
    intervals.push({
      startHour: leagueState.playStartHour,
      endHour: leagueState.playEndHour
    });
  }

  const buckets = mergeIntervals(intervals);
  return buckets.map(bucket => toActiveCron(bucket.startHour, bucket.endHour, nowUtc));
}

export function collectSchedulesFromState(state, nowUtc) {
  const activeCrons = buildActiveBucketCronsFromState(state, nowUtc);
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
