import { GitHubClient } from "../../api/githubClient.js";
import { loadRuntimeConfig } from "../updater/configLoader.js";
import { loadPreviousCachedData } from "../updater/cache.js";
import { detectRevisionChanges } from "../updater/revisionDetector.js";
import { runFandomUpdate } from "../updater/fandomSync.js";
import { commitRevisionWrites } from "../updater/revWriter.js";
import { refreshScheduleBoardOnDayRollover } from "../updater/dayRollover.js";
import { ensureDayInitialized, reconcileLeagueStates, resolveScheduledExecutionSlugs } from "../scheduler/dynamicCronManager.js";
import { Logger } from "../../infrastructure/logger.js";
import { refreshRuntimeMeta } from "./runtimeMetaRefresh.js";

const SKIP_CRON = Symbol("skip cron");

function requireTournaments(runtimeConfig) {
  if (!Array.isArray(runtimeConfig.TOURNAMENTS)) {
    throw new Error("runtimeConfig.TOURNAMENTS must be an array");
  }
  return runtimeConfig.TOURNAMENTS;
}

function intersectTournaments(tournaments, scopeSlugs) {
  if (!(scopeSlugs instanceof Set)) return tournaments;
  return tournaments.filter(tournament => scopeSlugs.has(tournament.slug));
}

async function resolveCronScope(env, event, tournaments) {
  const executionSlugs = await resolveScheduledExecutionSlugs(env, event.scheduledTime, event.cron);
  if (executionSlugs instanceof Set && executionSlugs.size === 0) {
    await reconcileLeagueStates(env, tournaments, event.scheduledTime);
    return SKIP_CRON;
  }
  return executionSlugs;
}

async function detectScopedRevisionChanges(env, tournaments, executionSlugs) {
  const scopedTournaments = intersectTournaments(tournaments, executionSlugs);
  const { changedSlugs, revidChanges, pendingRevisionWrites, hasErrors, checkedSlugs } = await detectRevisionChanges(env, scopedTournaments);
  console.log(`[UPDATE:REV] checked=${checkedSlugs} changed=${changedSlugs.size} errors=${hasErrors ? 1 : 0}`);

  const checkedSlugSet = new Set(scopedTournaments.map(tournament => tournament.slug));
  const unchangedSlugs = new Set([...checkedSlugSet].filter(slug => !changedSlugs.has(slug)));
  return { changedSlugs, unchangedSlugs, revidChanges, pendingRevisionWrites };
}

async function runChangedRevisionPath(env, githubClient, runtimeConfig, tournaments, revisionResult, logger) {
  const { changedSlugs, revidChanges, pendingRevisionWrites } = revisionResult;
  if (changedSlugs.size > 0) {
    const changedTournaments = intersectTournaments(tournaments, changedSlugs);
    const cache = await loadPreviousCachedData(env, changedTournaments);
    console.log(`[UPDATE:GATE] fandom slugs=${Array.from(changedSlugs).join(", ")}`);
    await runFandomUpdate(env, githubClient, runtimeConfig, cache, false, changedSlugs, {
      forceWrite: false,
      revidChanges,
      pendingRevisionWrites
    }, logger);
  } else {
    await commitRevisionWrites(env, pendingRevisionWrites);
  }
}

async function runUnchangedRuntimeMetaPath(env, runtimeConfig, unchangedSlugs) {
  if (unchangedSlugs.size > 0) {
    console.log(`[UPDATE:GATE] runtime-meta slugs=${Array.from(unchangedSlugs).join(", ")}`);
    await refreshRuntimeMeta(env, runtimeConfig, unchangedSlugs);
  }
}

async function runScheduleMaintenancePath(env, runtimeConfig, tournaments, scheduledTimeMs) {
  await refreshScheduleBoardOnDayRollover(env, runtimeConfig, scheduledTimeMs);
  await ensureDayInitialized(env, tournaments, scheduledTimeMs);
  await reconcileLeagueStates(env, tournaments, scheduledTimeMs);
}

export async function runCron(env, event) {
  const githubClient = new GitHubClient(env);
  const logger = new Logger();
  const runtimeConfig = await loadRuntimeConfig(env, githubClient);
  const tournaments = requireTournaments(runtimeConfig);

  const executionSlugs = await resolveCronScope(env, event, tournaments);
  if (executionSlugs === SKIP_CRON) return;

  const revisionResult = await detectScopedRevisionChanges(env, tournaments, executionSlugs);
  await runChangedRevisionPath(env, githubClient, runtimeConfig, tournaments, revisionResult, logger);
  await runUnchangedRuntimeMetaPath(env, runtimeConfig, revisionResult.unchangedSlugs);
  await runScheduleMaintenancePath(env, runtimeConfig, tournaments, event.scheduledTime);
}
