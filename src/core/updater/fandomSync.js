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

function buildScopedTournaments(tournaments, scopeSlugs) {
  if (!Array.isArray(tournaments)) {
    throw new Error("tournaments must be an array");
  }
  return tournaments.filter(tournament => scopeSlugs.has(tournament.slug));
}

function buildScopedRawMatches(rawMatches, scopeSlugs) {
  return Object.fromEntries([...scopeSlugs].map(slug => {
    const matches = rawMatches[slug];
    if (!Array.isArray(matches)) throw new Error(`RAW_MATCHES missing in analysis scope: ${slug}`);
    return [slug, matches];
  }));
}

function buildFandomOptions(force, options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("fandom options must be a JSON object");
  }
  const revidChanges = options.revidChanges === undefined ? {} : options.revidChanges;
  const pendingRevisionWrites = options.pendingRevisionWrites === undefined ? {} : options.pendingRevisionWrites;
  if (!revidChanges || typeof revidChanges !== "object" || Array.isArray(revidChanges)) {
    throw new Error("revidChanges must be a JSON object");
  }
  if (!pendingRevisionWrites || typeof pendingRevisionWrites !== "object" || Array.isArray(pendingRevisionWrites)) {
    throw new Error("pendingRevisionWrites must be a JSON object");
  }
  return {
    forceWrite: options.forceWrite === undefined ? force : !!options.forceWrite,
    revidChanges,
    pendingRevisionWrites
  };
}

async function createFandomClient(env) {
  const authContext = await FandomClient.login(env.FANDOM_BOT_USERNAME, env.FANDOM_BOT_PASSWORD);
  return {
    authContext,
    fandomClient: new FandomClient(authContext)
  };
}

async function fetchAndProcessFandom(env, tournaments, cache, force, forceSlugs) {
  const candidates = determineCandidates(tournaments, forceSlugs);
  if (candidates.length === 0) {
    console.log(`[FANDOM:SKIP] no-candidates`);
    return null;
  }

  const { authContext, fandomClient } = await createFandomClient(env);
  const results = await fetchMatchData(fandomClient, candidates);
  const processed = processResults(results, cache, force, forceSlugs, tournaments);
  const { syncItems, skipItems, dropBreakers, fetchErrors } = processed;
  console.log(`[FANDOM:PROCESS] sync=${syncItems.length} skip=${skipItems.length} breakers=${dropBreakers.length} errors=${fetchErrors.length}`);
  return { authContext, ...processed };
}

function attachRevisionChanges(items, revidChanges) {
  for (const item of items) {
    if (revidChanges[item.slug]) {
      item.revidChanges = revidChanges[item.slug];
    }
  }
}

function buildLogs(tournaments, processed, authContext, logger) {
  const { syncItems, skipItems, dropBreakers, fetchErrors, displayNameMap } = processed;
  generateLog(syncItems, skipItems, dropBreakers, fetchErrors, authContext, logger);
  return buildLeagueLogEntries(syncItems, skipItems, dropBreakers, fetchErrors, authContext, tournaments, displayNameMap);
}

async function persistFacts(env, scopedTournaments, cache, teamsRaw, writeScopeSlugs) {
  if (writeScopeSlugs.size === 0) return;
  await prepareTournamentContext(env, scopedTournaments, cache, teamsRaw);
  const scopedRawMatches = buildScopedRawMatches(cache.rawMatches, writeScopeSlugs);
  const analysis = Analyzer.runFullAnalysis(scopedRawMatches, scopedTournaments, UPDATE_CONFIG.MAX_SCHEDULE_DAYS);
  await writeTournamentFacts(env, scopedTournaments, cache, analysis, writeScopeSlugs);
  return analysis;
}

async function rebuildProjections(env, scopedTournaments, cache, analysis, writeScopeSlugs) {
  if (writeScopeSlugs.size === 0) return;
  await writeHomeProjections(env, scopedTournaments, cache, analysis, writeScopeSlugs);
}

export async function runFandomUpdate(env, githubClient, tournaments, teamsRaw, cache, force = false, forceSlugs = null, options = {}, logger) {
  const { forceWrite, revidChanges, pendingRevisionWrites } = buildFandomOptions(force, options);
  const processed = await fetchAndProcessFandom(env, tournaments, cache, force, forceSlugs);
  if (!processed) return;

  const { brokenSlugs, errorSlugs, syncItems, skipItems, authContext } = processed;
  attachRevisionChanges([...syncItems, ...skipItems], revidChanges);
  const leagueLogEntries = buildLogs(tournaments, processed, authContext, logger);

  const writeScopeSlugs = buildWriteScopeSlugs(tournaments, syncItems, skipItems, forceWrite, forceSlugs);
  const scopedTournaments = buildScopedTournaments(tournaments, writeScopeSlugs);
  const analysis = await persistFacts(env, scopedTournaments, cache, teamsRaw, writeScopeSlugs);
  const failedSlugs = new Set([...brokenSlugs, ...errorSlugs]);
  await Promise.all([
    rebuildProjections(env, scopedTournaments, cache, analysis, writeScopeSlugs),
    appendLeagueLogs(env, leagueLogEntries),
    commitRevisionWrites(env, pendingRevisionWrites, failedSlugs)
  ]);
}
