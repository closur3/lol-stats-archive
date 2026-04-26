import { FandomClient } from '../../api/fandomClient.js';
import { Analyzer } from '../analyzer.js';
import { determineCandidates } from './candidates.js';
import { fetchMatchData } from './fetchData.js';
import { prepareTournamentContext } from './context.js';
import { processResults } from './dataProcessor.js';
import { generateLog, buildLeagueLogEntries } from './logWriter.js';
import { saveData } from './persister.js';
import { commitRevisionWrites } from './revWriter.js';
import { UPDATE_CONFIG } from './types.js';

export async function runFandomUpdate(env, githubClient, runtimeConfig, cache, force = false, forceSlugs = null, options = {}, logger, _getSlowThresholdMs) {
  const forceWrite = options.forceWrite === undefined ? force : !!options.forceWrite;
  const passedRevidChanges = options.revidChanges || {};
  const pendingRevisionWrites = options.pendingRevisionWrites || {};
  let teamsRaw = null;
  try {
    teamsRaw = await githubClient.fetchJson("config/teams.json");
  } catch (error) { console.error("[Context] Failed to load teams.json:", error.message); }

  const candidates = determineCandidates(runtimeConfig.TOURNAMENTS, forceSlugs);
  if (candidates.length === 0) {
    console.log(`[SKIP] All tournaments skipped`);
    return;
  }

  const revidChanges = passedRevidChanges;

  const authContext = await FandomClient.login(env.FANDOM_USER, env.FANDOM_PASS);
  const fandomClient = new FandomClient(authContext);

  const results = await fetchMatchData(fandomClient, candidates);

  const { failedSlugs, syncItems, idleItems, breakers, apiErrors, displayNameMap } = processResults(results, cache, force, forceSlugs, runtimeConfig);
  console.log(`[FANDOM] process sync=${syncItems.length} idle=${idleItems.length} breakers=${breakers.length} apiErrors=${apiErrors.length} failed=${failedSlugs.size}`);

  for (const item of [...syncItems, ...idleItems]) {
    if (revidChanges[item.slug]) {
      item.revidChanges = revidChanges[item.slug];
    }
  }

  await prepareTournamentContext(env, runtimeConfig, cache, teamsRaw);

  const analysis = Analyzer.runFullAnalysis(cache.rawMatches, runtimeConfig, UPDATE_CONFIG.MAX_SCHEDULE_DAYS);

  generateLog(syncItems, idleItems, breakers, apiErrors, authContext, logger);
  const leagueLogEntries = buildLeagueLogEntries(syncItems, idleItems, breakers, apiErrors, authContext, runtimeConfig, displayNameMap);

  const saveSummary = await saveData(env, runtimeConfig, cache, analysis, syncItems, idleItems, forceWrite, forceSlugs, leagueLogEntries);

  await commitRevisionWrites(env, pendingRevisionWrites, failedSlugs, saveSummary?.failedHomeSlugs || new Set());
}