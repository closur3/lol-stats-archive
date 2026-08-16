import { readExistingRawMatchesByName } from "../facts/rawMatchesStore.js";
import { detectRevisionChanges } from "../updater/revisionDetector.js";
import { prepareActiveUpdate } from "../updater/activeUpdatePreparer.js";
import { commitRevisionWrites } from "../updater/revWriter.js";
import { runScheduleMaintenance } from "../scheduler/scheduleMaintenanceRunner.js";
import {
  assertScheduledExecutionState,
  resolveScheduledExecutionTarget,
  ScheduledExecutionStateError
} from "../scheduler/scheduledExecutionScope.js";
import { resolveScheduleOptions } from "../scheduler/scheduleOptions.js";
import {
  auditTournamentRuntime,
  reconcileTournamentRuntime
} from "../updater/tournamentRuntimeReconciler.js";
import { assertRawMatchesAvailable } from "../facts/rawMatchesStore.js";
import { commitActiveLogWrites } from "../updater/logPersistence.js";
import { commitActiveUpdate } from "../updater/activeUpdateCommitter.js";
import { rejectActiveUpdate } from "../updater/activeUpdateRejection.js";
import { baselineCron } from "../scheduler/cronBuckets.js";
import { readScheduleState, ScheduleStateSchemaError } from "../scheduler/scheduleState.js";

function filterTournaments(tournaments, names) {
  return tournaments.filter(tournament => names.has(tournament.name));
}

async function detectRevisionChangesForTarget(env, tournaments, target) {
  const scopedTournaments = target.type === 'scoped'
    ? filterTournaments(tournaments, target.names)
    : tournaments;
  const { changedNames, revidChanges, pendingRevisionWrites, checkedNames } = await detectRevisionChanges(env, scopedTournaments);
  console.log(`[REV:SUMMARY] checked=${checkedNames} changed=${changedNames.size}`);

  return { changedNames, revidChanges, pendingRevisionWrites };
}

async function prepareRevisionPath(env, tournaments, revisionResult) {
  const { changedNames, revidChanges, pendingRevisionWrites } = revisionResult;
  let activeUpdatePlan = null;
  if (changedNames.size > 0) {
    const changedTournaments = filterTournaments(tournaments, changedNames);
    const rawMatchesByName = await readExistingRawMatchesByName(env, changedTournaments);
    console.log(`[FANDOM:SYNC] names=${Array.from(changedNames).join(", ")}`);
    activeUpdatePlan = await prepareActiveUpdate(env, tournaments, rawMatchesByName, changedNames, {
      reasonsByName: new Map(Array.from(changedNames, tournamentName => [tournamentName, "revision"])),
      rebuild: false,
      revidChanges
    });
    if (!activeUpdatePlan.accepted) await rejectActiveUpdate(env, activeUpdatePlan);
  }
  return { pendingRevisionWrites, activeUpdatePlan };
}

async function runRevisionPath(env, tournaments, target, scheduledTime, scheduleOptions) {
  const revisionResult = await detectRevisionChangesForTarget(env, tournaments, target);
  const revisionPlan = await prepareRevisionPath(env, tournaments, revisionResult);
  if (revisionPlan.activeUpdatePlan) {
    await commitActiveUpdate(env, revisionPlan.activeUpdatePlan);
    await runScheduleMaintenance(env, tournaments, scheduledTime, scheduleOptions);
  }
  await commitRevisionWrites(env, revisionPlan.pendingRevisionWrites);
  if (revisionPlan.activeUpdatePlan) {
    await commitActiveLogWrites(env, revisionPlan.activeUpdatePlan.activeLogWrites);
  }
}

async function ensureScheduledExecutionState(env, tournaments, scheduledTime, scheduleOptions) {
  let scheduleState;
  try {
    scheduleState = await readScheduleState(env);
    if (scheduleState === null) {
      return (await runScheduleMaintenance(env, tournaments, scheduledTime, scheduleOptions)).scheduleState;
    }
    assertScheduledExecutionState(scheduleState, tournaments, scheduledTime);
    return scheduleState;
  } catch (error) {
    if (!(error instanceof ScheduleStateSchemaError) && !(error instanceof ScheduledExecutionStateError)) throw error;
    console.error(`[SCHED:STATE] rebuilding unavailable ScheduleState: ${error.message}`);
    return (await runScheduleMaintenance(env, tournaments, scheduledTime, scheduleOptions)).scheduleState;
  }
}

async function runBaselineCron(env, event, scheduleOptions) {
  const reconcileResult = await auditTournamentRuntime(env, event.scheduledTime, scheduleOptions);
  const tournaments = reconcileResult.config.active;
  await assertRawMatchesAvailable(env, tournaments);
  if (reconcileResult.scheduleRuntime === null) {
    await runScheduleMaintenance(env, tournaments, event.scheduledTime, scheduleOptions);
  }
  await runRevisionPath(env, tournaments, { type: "all" }, event.scheduledTime, scheduleOptions);
}

async function runBucketCron(env, event, scheduleOptions) {
  const reconcileResult = await reconcileTournamentRuntime(env, event.scheduledTime, scheduleOptions);
  const tournaments = reconcileResult.config.active;
  const scheduleState = reconcileResult.scheduleRuntime?.scheduleState
    ?? await ensureScheduledExecutionState(env, tournaments, event.scheduledTime, scheduleOptions);
  const target = resolveScheduledExecutionTarget(scheduleState, tournaments, event.scheduledTime, event.cron);
  if (target.type === "none") return;
  await runRevisionPath(env, tournaments, target, event.scheduledTime, scheduleOptions);
}

export async function runCron(env, event) {
  const scheduleOptions = resolveScheduleOptions(env);
  if (event.cron === baselineCron) {
    await runBaselineCron(env, event, scheduleOptions);
    return;
  }
  await runBucketCron(env, event, scheduleOptions);
}
