import { updateSchedules } from "./cloudflareSchedules.js";
import { collectSchedulesFromState } from "./cronBuckets.js";
import { attachSchedulePlan, writeControl } from "./scheduleState.js";

function readAppliedSchedules(state) {
  if (state.schedules === undefined) return [];
  if (!Array.isArray(state.schedules)) throw new Error("SCHEDULE_DAY.schedules must be an array");
  return state.schedules;
}

function recordScheduleApplyFailure(options, reason, error) {
  const message = `${reason}: ${error.message}`;
  if (Array.isArray(options.scheduleWarnings)) options.scheduleWarnings.push(message);
  console.warn(`[SCHED:${reason}] schedule apply failed: ${error.message}`);
}

export async function writeStateAndSchedules(env, state, nowUtc, reason, options = {}) {
  const schedules = collectSchedulesFromState(state, nowUtc);
  attachSchedulePlan(state, schedules, nowUtc, false);

  if (options.applySchedules === false) {
    await writeControl(env, state);
    console.log(`[SCHED:${reason}] date=${state.date} schedules=${schedules.join(",")} apply=skip`);
    return;
  }
  try {
    await updateSchedules(env, schedules);
    attachSchedulePlan(state, schedules, nowUtc, true);
  } catch (error) {
    if (options.applySchedules === "best-effort") {
      recordScheduleApplyFailure(options, reason, error);
      await writeControl(env, state);
      return;
    }
    throw error;
  }

  await writeControl(env, state);
  console.log(`[SCHED:${reason}] date=${state.date} schedules=${schedules.join(",")}`);
}

export async function ensureSchedulesApplied(env, state, nowUtc, options = {}) {
  const schedules = collectSchedulesFromState(state, nowUtc);
  if (JSON.stringify(readAppliedSchedules(state)) === JSON.stringify(schedules) && state.schedulesAppliedAt) return false;
  if (options.applySchedules === false) {
    await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, false));
    console.log(`[SCHED:REAPPLY] date=${state.date} schedules=${schedules.join(",")} apply=skip`);
    return true;
  }
  try {
    await updateSchedules(env, schedules);
  } catch (error) {
    if (options.applySchedules === "best-effort") {
      await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, false));
      recordScheduleApplyFailure(options, "REAPPLY", error);
      return true;
    }
    throw error;
  }
  await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, true));
  console.log(`[SCHED:REAPPLY] date=${state.date} schedules=${schedules.join(",")}`);
  return true;
}
