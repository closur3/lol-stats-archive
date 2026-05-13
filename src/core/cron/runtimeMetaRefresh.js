import { computeTournamentMetaFromRawMatches } from "../analysis/tournamentMeta.js";
import { readRawMatches } from "../facts/rawMatchesStore.js";
import { readScheduleMeta, sameScheduleMeta, writeScheduleMeta } from "../facts/scheduleMetaStore.js";
import { refreshHomeStaticFromCache } from "../updater/cacheRebuilder.js";

function selectTournaments(runtimeConfig, scopeSlugs) {
  const tournaments = runtimeConfig.TOURNAMENTS || [];
  if (!(scopeSlugs instanceof Set)) return tournaments;
  return tournaments.filter(tournament => scopeSlugs.has(tournament.slug));
}

export async function refreshRuntimeMeta(env, runtimeConfig, scopeSlugs) {
  const tournaments = selectTournaments(runtimeConfig, scopeSlugs);
  const changedSlugs = [];

  for (const tournament of tournaments) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");

    const rawMatches = await readRawMatches(env, slug);
    const computedMeta = computeTournamentMetaFromRawMatches(rawMatches);
    const currentMeta = await readScheduleMeta(env, slug);
    if (sameScheduleMeta(currentMeta, computedMeta)) continue;

    await writeScheduleMeta(env, slug, computedMeta);
    changedSlugs.push(slug);
  }

  if (changedSlugs.length > 0) {
    await refreshHomeStaticFromCache(env);
  }

  return changedSlugs;
}
