import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { kvPutIfChanged } from "../../utils/kvStore.js";

export function buildWriteScopeSlugs(runtimeConfig, syncItems, skipItems, force, forceSlugs) {
  const scope = new Set([
    ...(syncItems || []).map(item => item?.slug).filter(Boolean),
    ...(skipItems || []).map(item => item?.slug).filter(Boolean)
  ]);

  if (!force) return scope;
  if (forceSlugs && forceSlugs.size > 0) {
    for (const slug of forceSlugs) scope.add(slug);
    return scope;
  }

  for (const tournament of runtimeConfig.TOURNAMENTS || []) {
    if (tournament?.slug) scope.add(tournament.slug);
  }
  return scope;
}

export function buildScheduleBySlug(runtimeConfig, scheduleMap) {
  const tournamentIndexMap = new Map((runtimeConfig.TOURNAMENTS || []).map((tournament, index) => [tournament.slug, index]));
  const scheduleBySlug = {};

  for (const [date, matches] of Object.entries(scheduleMap || {})) {
    for (const match of matches || []) {
      const slug = match.slug;
      const index = tournamentIndexMap.get(slug);
      if (index === undefined) continue;
      if (!scheduleBySlug[slug]) scheduleBySlug[slug] = {};
      if (!scheduleBySlug[slug][date]) scheduleBySlug[slug][date] = [];
      scheduleBySlug[slug][date].push({ ...match, tournamentIndex: index });
    }
  }

  return scheduleBySlug;
}

export function buildHomeSnapshot(tournament, cache, analysis, scheduleBySlug) {
  const slug = tournament.slug;
  const { teamMap, ...tournamentStored } = tournament;
  return {
    tournament: tournamentStored,
    stats: analysis.globalStats?.[slug] || {},
    timeGrid: analysis.timeGrid?.[slug] || {},
    scheduleMap: scheduleBySlug[slug] || {},
    teamMap
  };
}

export async function writeHomeProjections(env, runtimeConfig, cache, analysis, writeScopeSlugs) {
  const scheduleBySlug = buildScheduleBySlug(runtimeConfig, analysis.scheduleMap);

  await Promise.all((runtimeConfig.TOURNAMENTS || []).map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    if (!writeScopeSlugs.has(slug)) return;
    const homeSnapshot = buildHomeSnapshot(tournament, cache, analysis, scheduleBySlug);
    await kvPutIfChanged(env, kvKeys.home(slug), homeSnapshot);
    cache.homes[slug] = homeSnapshot;
  }));
}
