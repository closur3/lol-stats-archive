import { readTournamentConfig } from "../facts/tournamentConfigReader.js";
import { assertTournamentConfigDigest } from "../facts/tournamentConfigDigest.js";
import { buildTournamentApplyState } from "../facts/tournamentConfigFingerprint.js";
import {
  haveSameTournamentApplyState,
  writeTournamentApplyState
} from "../facts/tournamentApplyState.js";
import { rebuildSchedule } from "../scheduler/scheduleMaintenanceRunner.js";
import { prepareArchiveMigrations } from "./archiveMigrationPreparer.js";
import {
  cleanupArchiveMigrations,
  writeArchiveMigrations
} from "./archiveMigrationCommitter.js";
import { prepareActiveTournaments } from "./activeRebuildPreparer.js";
import { commitActiveUpdate } from "./activeUpdateCommitter.js";
import { deleteActiveRuntimeFacts } from "./activeTournamentDeletion.js";
import { deriveTournamentTransition } from "./tournamentTransition.js";
import { assertActiveRuntimeMatchesConfig } from "./activeRuntimeValidator.js";
import {
  auditTournamentApplyBaseline,
  resolveTournamentApplyBaseline
} from "./tournamentApplyBaseline.js";
import { commitRevisionWrites } from "./revWriter.js";
import { commitActiveLogWrites } from "./logPersistence.js";

function logTransition(transition) {
  console.log(
    `[TOURNAMENT:RECONCILE] added=${transition.added.join(",")} updated=${transition.updated.join(",")} archived=${transition.archived.join(",")} dropped=${transition.dropped.join(",")}`
  );
}

async function assertConfigUnchanged(env, expectedDigest) {
  const currentConfig = await readTournamentConfig(env);
  if (currentConfig.configDigest !== expectedDigest) {
    throw new Error("TournamentConfig changed during runtime reconciliation");
  }
}

export class TournamentConfigVersionError extends Error {
  constructor(expectedDigest, actualDigest, readError = null) {
    const actualLabel = actualDigest ?? `unreadable (${readError})`;
    super(`TournamentConfig version mismatch: expected ${expectedDigest}, received ${actualLabel}`);
    this.name = "TournamentConfigVersionError";
    this.expectedDigest = expectedDigest;
    this.actualDigest = actualDigest;
  }
}

function assertReconcileInputs(scheduledTimeMs, scheduleOptions) {
  if (!Number.isFinite(scheduledTimeMs)) throw new Error("scheduledTimeMs must be finite");
  if (!scheduleOptions || typeof scheduleOptions !== "object" || Array.isArray(scheduleOptions)) {
    throw new Error("scheduleOptions must be an object");
  }
}

async function reconcileConfig(env, config, scheduledTimeMs, scheduleOptions, readApplyBaseline) {
  const desiredApplyState = await buildTournamentApplyState(config);
  const previousApplyState = await readApplyBaseline(env, desiredApplyState);
  if (haveSameTournamentApplyState(previousApplyState, desiredApplyState)) {
    const transition = { added: [], updated: [], archived: [], dropped: [] };
    return { config, transition, configChanged: false, scheduleRuntime: null };
  }

  const transition = deriveTournamentTransition(config.archive, desiredApplyState, previousApplyState);
  logTransition(transition);

  const rebuildReasons = new Map([
    ...transition.added.map(tournamentName => [tournamentName, "added"]),
    ...transition.updated.map(tournamentName => [tournamentName, "updated"])
  ]);
  const [archiveMigrations, activePreparation] = await Promise.all([
    prepareArchiveMigrations(env, config.archive, new Set(transition.archived)),
    prepareActiveTournaments(env, config.active, rebuildReasons)
  ]);

  await writeArchiveMigrations(env, archiveMigrations);
  if (activePreparation.activeUpdatePlan) {
    await commitActiveUpdate(env, activePreparation.activeUpdatePlan);
  }
  await cleanupArchiveMigrations(env, archiveMigrations);
  await Promise.all(transition.dropped.map(tournamentName => deleteActiveRuntimeFacts(env, tournamentName)));
  const scheduleRuntime = await rebuildSchedule(env, config.active, scheduledTimeMs, scheduleOptions);

  await assertActiveRuntimeMatchesConfig(env, config.active);
  await assertConfigUnchanged(env, desiredApplyState.configDigest);
  await commitRevisionWrites(env, activePreparation.pendingRevisionWrites);
  await writeTournamentApplyState(env, desiredApplyState);
  if (activePreparation.activeUpdatePlan) {
    await commitActiveLogWrites(env, activePreparation.activeUpdatePlan.activeLogWrites);
  }
  return { config, transition, configChanged: true, scheduleRuntime };
}

export async function reconcileTournamentRuntime(env, scheduledTimeMs, scheduleOptions) {
  assertReconcileInputs(scheduledTimeMs, scheduleOptions);
  const config = await readTournamentConfig(env);
  return reconcileConfig(env, config, scheduledTimeMs, scheduleOptions, resolveTournamentApplyBaseline);
}

export async function auditTournamentRuntime(env, scheduledTimeMs, scheduleOptions) {
  assertReconcileInputs(scheduledTimeMs, scheduleOptions);
  const config = await readTournamentConfig(env);
  return reconcileConfig(env, config, scheduledTimeMs, scheduleOptions, auditTournamentApplyBaseline);
}

export async function reconcileTournamentRuntimeForConfig(env, scheduledTimeMs, scheduleOptions, expectedDigest) {
  assertReconcileInputs(scheduledTimeMs, scheduleOptions);
  const normalizedExpectedDigest = assertTournamentConfigDigest(expectedDigest, "expectedConfigDigest");
  let config;
  try {
    config = await readTournamentConfig(env);
  } catch (error) {
    throw new TournamentConfigVersionError(normalizedExpectedDigest, null, error.message);
  }
  if (config.configDigest !== normalizedExpectedDigest) {
    throw new TournamentConfigVersionError(normalizedExpectedDigest, config.configDigest);
  }
  return reconcileConfig(env, config, scheduledTimeMs, scheduleOptions, auditTournamentApplyBaseline);
}
