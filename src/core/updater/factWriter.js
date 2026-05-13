import { writeRawMatches } from "../facts/rawMatchesStore.js";
import { writeScheduleMeta } from "../facts/scheduleMetaStore.js";

export async function writeTournamentFacts(env, runtimeConfig, cache, analysis, writeScopeSlugs) {
  await Promise.all((runtimeConfig.TOURNAMENTS || []).map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    if (!writeScopeSlugs.has(slug)) return;
    await writeRawMatches(env, slug, cache.rawMatches[slug] || []);
    await writeScheduleMeta(env, slug, analysis.tournamentMeta?.[slug] || {});
  }));
}
