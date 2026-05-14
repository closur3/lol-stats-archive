import { dataUtils } from '../../utils/dataUtils.js';

export async function prepareTournamentContext(env, runtimeConfig, cache, teamsRaw) {
  if (!Array.isArray(runtimeConfig.TOURNAMENTS)) {
    throw new Error("runtimeConfig.TOURNAMENTS must be an array");
  }
  for (const tournament of runtimeConfig.TOURNAMENTS) {
    const rawMatches = cache.rawMatches[tournament.slug];
    if (!Array.isArray(rawMatches)) throw new Error(`RAW_MATCHES missing in context: ${tournament.slug}`);
    tournament.teamMap = dataUtils.pickTeamMap(teamsRaw, tournament, rawMatches);
  }
}
