import { buildActiveBucketCronsFromState, shouldRunScheduledTournamentAt } from "./cronBuckets.js";
import { timePolicy } from "../../utils/timePolicy.js";

export class ScheduledExecutionStateError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScheduledExecutionStateError";
  }
}

export function assertScheduledExecutionState(scheduleState, tournaments, scheduledTimeMs) {
  if (!scheduleState || typeof scheduleState !== "object" || Array.isArray(scheduleState)) {
    throw new ScheduledExecutionStateError("ScheduleState missing for scheduled execution");
  }
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  const now = new Date(scheduledTimeMs);
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid scheduledTimeMs: ${scheduledTimeMs}`);
  const today = timePolicy.getAppDateKey(now);
  if (scheduleState.date !== today) {
    throw new ScheduledExecutionStateError(`ScheduleState date mismatch: ${scheduleState.date} != ${today}`);
  }
  if (!scheduleState.controlsByName || typeof scheduleState.controlsByName !== "object" || Array.isArray(scheduleState.controlsByName)) {
    throw new ScheduledExecutionStateError("ScheduleState controlsByName missing for scheduled execution");
  }
  const expectedNames = tournaments.map(tournament => {
    const tournamentName = tournament?.name;
    if (!tournamentName) throw new Error("Tournament tournamentName missing");
    return tournamentName;
  });
  const controlNames = Object.keys(scheduleState.controlsByName);
  const expectedNameSet = new Set(expectedNames);
  if (
    expectedNameSet.size !== expectedNames.length
    || controlNames.length !== expectedNames.length
    || controlNames.some(tournamentName => !expectedNameSet.has(tournamentName))
  ) {
    throw new ScheduledExecutionStateError("ScheduleState controls do not match TournamentConfig.active");
  }
  return scheduleState;
}

export function resolveScheduledExecutionTarget(scheduleState, tournaments, scheduledTimeMs, eventCron) {
  const state = assertScheduledExecutionState(scheduleState, tournaments, scheduledTimeMs);
  const now = new Date(scheduledTimeMs);

  const activeCrons = new Set(buildActiveBucketCronsFromState(state, now));
  if (!activeCrons.has(eventCron)) return { type: "all" };

  const names = new Set();
  for (const [tournamentName, control] of Object.entries(state.controlsByName)) {
    if (shouldRunScheduledTournamentAt(control, now)) names.add(tournamentName);
  }
  return names.size === 0 ? { type: "none" } : { type: "scoped", names };
}
