import { Analyzer } from '../analyzer.js';
import { prepareTournamentContext } from './context.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged } from '../../utils/kvStore.js';
import { recomputeCronOnMetaChange } from '../scheduler/dynamicCronManager.js';
import { loadTeamsConfig } from './teamsConfigLoader.js';

export async function runLocalUpdate(env, githubClient, runtimeConfig, cache, refreshHomeStaticFromCache, scopeSlugs = null) {
  let teamsRaw = null;
  try {
    teamsRaw = await loadTeamsConfig(env, githubClient);
  } catch (error) { console.error("[Context] Failed to load teams.json:", error.message); }
  await prepareTournamentContext(env, runtimeConfig, cache, teamsRaw);

  const changedSlugs = [];
  let shouldRecomputeCron = false;

  const tournaments = scopeSlugs instanceof Set
    ? (runtimeConfig.TOURNAMENTS || []).filter(tournament => scopeSlugs.has(tournament.slug))
    : (runtimeConfig.TOURNAMENTS || []);

  for (const tournament of tournaments) {
    const slug = tournament.slug;
    const home = cache.homes[slug];
    if (!home) continue;
    const rawMatches = cache.rawMatches[slug] || [];

    const computedMeta = Analyzer.computeTournamentMetaFromRawMatches(rawMatches);

    const existingTournament = home.tournament || {};
    if (existingTournament.todayEarliestTimestamp === computedMeta.todayEarliestTimestamp && (Number(existingTournament.todayUnfinished) || 0) === (Number(computedMeta.todayUnfinished) || 0) && (!!existingTournament.hasHistoryUnfinished) === (!!computedMeta.hasHistoryUnfinished)) continue;

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
    shouldRecomputeCron = true;
  }

  if (changedSlugs.length > 0) {
    await refreshHomeStaticFromCache(env);
  }
  if (shouldRecomputeCron) {
    await recomputeCronOnMetaChange(env, runtimeConfig.TOURNAMENTS || []);
  }
}
