import { Analyzer } from '../analyzer.js';
import { prepareTournamentContext } from './context.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged } from '../../utils/kvStore.js';

export async function runLocalUpdate(env, githubClient, runtimeConfig, cache, refreshHomeStaticFromCache) {
  let teamsRaw = null;
  try {
    teamsRaw = await githubClient.fetchJson("config/teams.json");
  } catch (error) { console.error("[Context] Failed to load teams.json:", error.message); }
  await prepareTournamentContext(env, runtimeConfig, cache, teamsRaw);

  const changedSlugs = [];

  for (const tournament of (runtimeConfig.TOURNAMENTS || [])) {
    const slug = tournament.slug;
    const home = cache.homes[slug];
    if (!home) continue;
    const rawMatches = cache.rawMatches[slug] || [];

    const computedMeta = Analyzer.computeTournamentMetaFromRawMatches(rawMatches);

    const existingTournament = home.tournament || {};
    if (existingTournament.mode === computedMeta.mode && existingTournament.emoji === computedMeta.emoji && existingTournament.todayEarliestTimestamp === computedMeta.todayEarliestTimestamp) continue;

    const { teamMap, ...tournamentStored } = tournament;
    const scheduleMap = home.scheduleMap || {};
    const homeKey = kvKeys.home(slug);
    const homeSnapshot = {
      tournament: { ...tournamentStored, ...computedMeta },
      rawMatches: home.rawMatches,
      stats: home.stats,
      timeGrid: home.timeGrid,
      scheduleMap,
      teamMap
    };

    await kvPutIfChanged(env, homeKey, homeSnapshot);
    cache.homes[slug] = homeSnapshot;
    changedSlugs.push(slug);
  }

  if (changedSlugs.length > 0) {
    await refreshHomeStaticFromCache(env);
  }
}