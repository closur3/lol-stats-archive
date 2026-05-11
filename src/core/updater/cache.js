import { kvKeys } from '../../infrastructure/kv/keyFactory.js';

export async function loadCachedData(env, tournaments) {
  const cache = { rawMatches: {}, homes: {} };
  const kv = env["lol-stats-kv"];

  const homeEntries = await Promise.all((tournaments || []).map(async tournament => {
    const homeEntry = await kv.get(kvKeys.home(tournament.slug), { type: "json" });
    return [tournament.slug, homeEntry];
  }));

  homeEntries.forEach(([slug, home]) => {
    if (home) {
      if (!home.tournament || home.tournament.slug !== slug) throw new Error(`Invalid HOME snapshot: ${slug}`);
      if (!Array.isArray(home.rawMatches)) throw new Error(`Invalid HOME rawMatches: ${slug}`);
      cache.rawMatches[slug] = home.rawMatches;
      cache.homes[slug] = home;
    }
  });

  return cache;
}
