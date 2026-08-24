import { assertScheduleSessionsFields } from "../facts/scheduleSessionsStore.js";
import { resolveSchedulePhase } from "../scheduler/scheduleDay.js";
import { timePolicy } from "../../utils/timePolicy.js";

function readNow(nowInput) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid tournament phase timestamp: ${nowInput}`);
  return now;
}

function compareMatches(left, right) {
  return left.scheduledAt - right.scheduledAt || left.matchId.localeCompare(right.matchId);
}

function readMatches(scheduleSessions) {
  return assertScheduleSessionsFields("ScheduleSessions", scheduleSessions).sessions
    .flatMap(session => session.matches)
    .sort(compareMatches);
}

export function selectTournamentPhase(scheduleSessions, nowInput = new Date()) {
  const now = readNow(nowInput);
  const matches = readMatches(scheduleSessions);
  const phase = resolveSchedulePhase(scheduleSessions, now);
  if (phase === "offday") {
    const nextMatch = matches.find(match => match.scheduledAt > now.getTime());
    const nextMatchDate = nextMatch ? timePolicy.getAppDateKey(nextMatch.scheduledAt) : null;
    return {
      phase,
      matches: nextMatchDate
        ? matches.filter(match => timePolicy.getAppDateKey(match.scheduledAt) === nextMatchDate)
        : [],
      countdownTimestamp: nextMatch?.scheduledAt ?? null
    };
  }

  const today = timePolicy.getAppDateKey(now);
  return {
    phase,
    matches: matches.filter(match => timePolicy.getAppDateKey(match.scheduledAt) === today),
    countdownTimestamp: null
  };
}
