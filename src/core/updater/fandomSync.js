import { FandomClient } from '../../api/fandomClient.js';
import { Analyzer } from '../analyzer.js';
import { determineCandidates } from './candidates.js';
import { fetchMatchData } from './fetchData.js';
import { prepareTournamentContext } from './context.js';
import { processResults } from './dataProcessor.js';
import { generateLog, buildLeagueLogEntries } from './logWriter.js';
import { buildWriteScopeSlugs, writeHomeProjections } from '../projection/homeProjector.js';
import { writeTournamentFacts } from './factWriter.js';
import { appendLeagueLogs } from './logPersistence.js';
import { commitRevisionWrites } from './revWriter.js';
import { UPDATE_CONFIG } from './types.js';
import { loadTeamsConfig } from './teamsConfigLoader.js';
import { refreshHomeStaticFromCache } from './cacheRebuilder.js';

function buildScopedRuntimeConfig(runtimeConfig, scopeSlugs) {
  return {
    ...runtimeConfig,
    TOURNAMENTS: (runtimeConfig.TOURNAMENTS || []).filter(tournament => scopeSlugs.has(tournament.slug))
  };
}

function buildScopedRawMatches(rawMatches, scopeSlugs) {
  return Object.fromEntries([...scopeSlugs].map(slug => {
    const matches = rawMatches[slug];
    if (!Array.isArray(matches)) throw new Error(`RAW_MATCHES missing in analysis scope: ${slug}`);
    return [slug, matches];
  }));
}

export async function runFandomUpdate(env, githubClient, runtimeConfig, cache, force = false, forceSlugs = null, options = {}, logger, _getSlowThresholdMs) {
  const forceWrite = options.forceWrite === undefined ? force : !!options.forceWrite;
  const passedRevidChanges = options.revidChanges || {};
  const pendingRevisionWrites = options.pendingRevisionWrites || {};
  const teamsRaw = await loadTeamsConfig(env, githubClient);

  const candidates = determineCandidates(runtimeConfig.TOURNAMENTS, forceSlugs);
  if (candidates.length === 0) {
    console.log(`[UPDATE:SKIP] all tournaments skipped`);
    return;
  }

  const revidChanges = passedRevidChanges;

  const authContext = await FandomClient.login(env.FANDOM_BOT_USERNAME, env.FANDOM_BOT_PASSWORD);
  const fandomClient = new FandomClient(authContext);

  const results = await fetchMatchData(fandomClient, candidates);

  const { failedSlugs, syncItems, skipItems, breakers, apiErrors, displayNameMap } = processResults(results, cache, force, forceSlugs, runtimeConfig);
  console.log(`[FANDOM:PROCESS] sync=${syncItems.length} skip=${skipItems.length} breakers=${breakers.length} apiErrors=${apiErrors.length} failed=${failedSlugs.size}`);

  for (const item of [...syncItems, ...skipItems]) {
    if (revidChanges[item.slug]) {
      item.revidChanges = revidChanges[item.slug];
    }
  }

  generateLog(syncItems, skipItems, breakers, apiErrors, authContext, logger);
  const leagueLogEntries = buildLeagueLogEntries(syncItems, skipItems, breakers, apiErrors, authContext, runtimeConfig, displayNameMap);

  const writeScopeSlugs = buildWriteScopeSlugs(runtimeConfig, syncItems, skipItems, forceWrite, forceSlugs);
  if (writeScopeSlugs.size > 0) {
    const scopedRuntimeConfig = buildScopedRuntimeConfig(runtimeConfig, writeScopeSlugs);
    await prepareTournamentContext(env, scopedRuntimeConfig, cache, teamsRaw);
    const scopedRawMatches = buildScopedRawMatches(cache.rawMatches, writeScopeSlugs);
    const analysis = Analyzer.runFullAnalysis(scopedRawMatches, scopedRuntimeConfig, UPDATE_CONFIG.MAX_SCHEDULE_DAYS);
    await writeTournamentFacts(env, scopedRuntimeConfig, cache, analysis, writeScopeSlugs);
    await writeHomeProjections(env, scopedRuntimeConfig, cache, analysis, writeScopeSlugs);
    await refreshHomeStaticFromCache(env);
  }
  await appendLeagueLogs(env, leagueLogEntries);

  await commitRevisionWrites(env, pendingRevisionWrites, failedSlugs);
}
