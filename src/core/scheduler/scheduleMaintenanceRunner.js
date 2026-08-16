import {
  ensureScheduleSessions,
  rebuildScheduleSessionsFromRawMatches
} from "../facts/scheduleSessionsStore.js";
import { buildCronsFromScheduleState } from "./cronBuckets.js";
import { runScheduleApply } from "./scheduleApplyRunner.js";
import { buildScheduleState } from "./schedulePlanBuilder.js";
import {
  areCronsApplied,
  readScheduleState,
  recordAppliedCrons,
  ScheduleStateSchemaError,
  writeScheduleState
} from "./scheduleState.js";
import { repairActiveSnapshotProjections } from "../updater/activeProjectionMaintenance.js";

function readScheduleNow(scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid scheduledTimeMs: ${scheduledTimeMs}`);
  return now;
}

function assertTournaments(tournaments) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
}

async function ensureScheduleRuntime(env, tournaments) {
  return Promise.all(tournaments.map(async tournament => {
    const tournamentName = tournament?.name;
    if (!tournamentName) throw new Error("Tournament tournamentName missing");
    return { tournamentName, scheduleSessions: await ensureScheduleSessions(env, tournament) };
  }));
}

async function rebuildScheduleRuntime(env, tournaments) {
  return Promise.all(tournaments.map(async tournament => {
    const tournamentName = tournament?.name;
    if (!tournamentName) throw new Error("Tournament tournamentName missing");
    return { tournamentName, scheduleSessions: await rebuildScheduleSessionsFromRawMatches(env, tournament) };
  }));
}

async function runScheduleStateUpdate(env, tournaments, runtime, now, previousState, applyReason, logLabel, options) {
  const sessionsByName = new Map(runtime.map(({ tournamentName, scheduleSessions }) => [tournamentName, { sessions: scheduleSessions.sessions }]));
  const state = buildScheduleState(tournaments, sessionsByName, now, previousState);
  const desiredCrons = buildCronsFromScheduleState(state);

  let applyResult = "unchanged";
  if (!areCronsApplied(state, desiredCrons)) {
    applyResult = await runScheduleApply(env, desiredCrons, applyReason, options);
    if (applyResult === "applied") recordAppliedCrons(state, desiredCrons);
  }
  const stateChanged = previousState === null || JSON.stringify(previousState) !== JSON.stringify(state);
  if (stateChanged) await writeScheduleState(env, state);
  console.log(`[SCHED:${logLabel}] date=${state.date} crons=${desiredCrons.join(",")} apply=${applyResult}`);
  return { scheduleState: state, scheduleSessionsByName: sessionsByName };
}

export async function runScheduleMaintenance(env, tournaments, scheduledTimeMs, options = {}) {
  assertTournaments(tournaments);
  const now = readScheduleNow(scheduledTimeMs);
  const runtime = await ensureScheduleRuntime(env, tournaments);
  await repairActiveSnapshotProjections(env, tournaments);
  let previousState;
  try {
    previousState = await readScheduleState(env);
  } catch (error) {
    if (!(error instanceof ScheduleStateSchemaError)) throw error;
    console.error(`[SCHED:STATE] replacing invalid ScheduleState: ${error.cause.message}`);
    previousState = null;
  }
  return runScheduleStateUpdate(
    env,
    tournaments,
    runtime,
    now,
    previousState,
    "RECONCILE",
    "STATE",
    options
  );
}

export async function rebuildSchedule(env, tournaments, scheduledTimeMs = Date.now(), options = {}) {
  assertTournaments(tournaments);
  const now = readScheduleNow(scheduledTimeMs);
  const runtime = await rebuildScheduleRuntime(env, tournaments);
  await repairActiveSnapshotProjections(env, tournaments);
  let previousState;
  try {
    previousState = await readScheduleState(env);
  } catch (error) {
    if (!(error instanceof ScheduleStateSchemaError)) throw error;
    console.error(`[SCHED:REBUILD] replacing invalid ScheduleState: ${error.cause.message}`);
    previousState = null;
  }
  return runScheduleStateUpdate(env, tournaments, runtime, now, previousState, "REBUILD", "REBUILD", options);
}
