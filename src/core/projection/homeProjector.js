import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { kvPutIfChanged } from "../../utils/kvStore.js";

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

export function buildWriteScopeSlugs(runtimeConfig, syncItems, skipItems, force, forceSlugs) {
  if (!Array.isArray(runtimeConfig.TOURNAMENTS)) {
    throw new Error("runtimeConfig.TOURNAMENTS must be an array");
  }
  if (!Array.isArray(syncItems)) throw new Error("syncItems must be an array");
  if (!Array.isArray(skipItems)) throw new Error("skipItems must be an array");
  const scope = new Set([
    ...syncItems.map(item => item?.slug).filter(Boolean),
    ...skipItems.map(item => item?.slug).filter(Boolean)
  ]);

  if (!force) return scope;
  if (forceSlugs && forceSlugs.size > 0) {
    for (const slug of forceSlugs) scope.add(slug);
    return scope;
  }

  for (const tournament of runtimeConfig.TOURNAMENTS) {
    if (tournament?.slug) scope.add(tournament.slug);
  }
  return scope;
}

export function buildScheduleBySlug(runtimeConfig, scheduleMap) {
  if (!Array.isArray(runtimeConfig.TOURNAMENTS)) {
    throw new Error("runtimeConfig.TOURNAMENTS must be an array");
  }
  requireObject(scheduleMap, "analysis.scheduleMap");
  const tournamentIndexMap = new Map(runtimeConfig.TOURNAMENTS.map((tournament, index) => [tournament.slug, index]));
  const scheduleBySlug = {};

  for (const [date, matches] of Object.entries(scheduleMap)) {
    if (!Array.isArray(matches)) throw new Error(`analysis.scheduleMap.${date} must be an array`);
    for (const match of matches) {
      const slug = match.slug;
      const index = tournamentIndexMap.get(slug);
      if (index === undefined) throw new Error(`Unknown schedule match slug: ${slug}`);
      if (!scheduleBySlug[slug]) scheduleBySlug[slug] = {};
      if (!scheduleBySlug[slug][date]) scheduleBySlug[slug][date] = [];
      scheduleBySlug[slug][date].push({ ...match, tournamentIndex: index });
    }
  }

  return scheduleBySlug;
}

function buildTournamentScheduleSnapshot(slug, scheduleBySlug) {
  const schedule = scheduleBySlug[slug];
  if (schedule === undefined) return {};
  requireObject(schedule, `analysis.scheduleMap.${slug}`);
  return schedule;
}

export function buildHomeSnapshot(tournament, cache, analysis, scheduleBySlug) {
  const slug = tournament.slug;
  const { teamMap, ...tournamentStored } = tournament;
  const stats = analysis.globalStats?.[slug];
  const timeGrid = analysis.timeGrid?.[slug];
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) throw new Error(`analysis.globalStats missing: ${slug}`);
  if (!timeGrid || typeof timeGrid !== "object" || Array.isArray(timeGrid)) throw new Error(`analysis.timeGrid missing: ${slug}`);
  return {
    tournament: tournamentStored,
    stats,
    timeGrid,
    scheduleMap: buildTournamentScheduleSnapshot(slug, scheduleBySlug),
    teamMap
  };
}

export async function writeHomeProjections(env, runtimeConfig, cache, analysis, writeScopeSlugs) {
  const scheduleBySlug = buildScheduleBySlug(runtimeConfig, analysis.scheduleMap);

  await Promise.all(runtimeConfig.TOURNAMENTS.map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    if (!writeScopeSlugs.has(slug)) return;
    const homeSnapshot = buildHomeSnapshot(tournament, cache, analysis, scheduleBySlug);
    await kvPutIfChanged(env, kvKeys.home(slug), homeSnapshot);
    cache.homes[slug] = homeSnapshot;
  }));
}
