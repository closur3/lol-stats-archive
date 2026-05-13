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

function intersectTournaments(tournaments, scopeSlugs) {
  if (!(scopeSlugs instanceof Set)) return tournaments || [];
  return (tournaments || []).filter(tournament => scopeSlugs.has(tournament.slug));
}

export async function runCron(env, event) {
  const githubClient = new GitHubClient(env);
  const logger = new Logger();
  const runtimeConfig = await loadRuntimeConfig(env, githubClient);
  const tournaments = runtimeConfig.TOURNAMENTS || [];

  const executionSlugs = await resolveScheduledExecutionSlugs(env, event.scheduledTime, event.cron);
  if (executionSlugs instanceof Set && executionSlugs.size === 0) {
    await reconcileLeagueStates(env, tournaments, event.scheduledTime);
    return;
  }

  const scopedTournaments = intersectTournaments(tournaments, executionSlugs);
  const { changedSlugs, revidChanges, pendingRevisionWrites, hasErrors, checkedSlugs } = await detectRevisionChanges(env, scopedTournaments);
  console.log(`[UPDATE:REV] checked=${checkedSlugs} changed=${changedSlugs.size} errors=${hasErrors ? 1 : 0}`);

  const checkedSlugSet = new Set(scopedTournaments.map(tournament => tournament.slug));
  const unchangedSlugs = new Set([...checkedSlugSet].filter(slug => !changedSlugs.has(slug)));

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

  if (unchangedSlugs.size > 0) {
    console.log(`[UPDATE:GATE] runtime-meta slugs=${Array.from(unchangedSlugs).join(", ")}`);
    await refreshRuntimeMeta(env, runtimeConfig, unchangedSlugs);
  }

  await refreshScheduleBoardOnDayRollover(env, runtimeConfig);
  await ensureDayInitialized(env, tournaments, event.scheduledTime);
  await reconcileLeagueStates(env, tournaments, event.scheduledTime);
}
