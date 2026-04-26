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
      if (home.rawMatches) cache.rawMatches[slug] = home.rawMatches;
      cache.homes[slug] = home;
    }
  });

  return cache;
}