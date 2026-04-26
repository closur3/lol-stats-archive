import { dataUtils } from '../../utils/dataUtils.js';

export async function prepareTournamentContext(env, runtimeConfig, cache, teamsRaw) {
  for (const tournament of (runtimeConfig.TOURNAMENTS || [])) {
    const rawMatches = cache.rawMatches[tournament.slug] || [];
    tournament.teamMap = dataUtils.pickTeamMap(teamsRaw, tournament, rawMatches);
  }
}