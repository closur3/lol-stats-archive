import { writeRawMatches } from "../facts/rawMatchesStore.js";
import { writeScheduleMeta } from "../facts/scheduleMetaStore.js";

export async function writeTournamentFacts(env, runtimeConfig, cache, analysis, writeScopeSlugs) {
  if (!Array.isArray(runtimeConfig.TOURNAMENTS)) {
    throw new Error("runtimeConfig.TOURNAMENTS must be an array");
  }
  await Promise.all(runtimeConfig.TOURNAMENTS.map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    if (!writeScopeSlugs.has(slug)) return;
    const rawMatches = cache.rawMatches[slug];
    if (!Array.isArray(rawMatches)) throw new Error(`RAW_MATCHES missing in write scope: ${slug}`);
    const meta = analysis.tournamentMeta?.[slug];
    if (!meta) throw new Error(`SCHEDULE_META missing in analysis: ${slug}`);
    await writeRawMatches(env, slug, rawMatches);
    await writeScheduleMeta(env, slug, meta);
  }));
}
