import { kvKeys } from "../../infrastructure/kv/keyFactory.js";

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

export function buildWriteScopeSlugs(tournaments, syncItems, skipItems, force, forceSlugs) {
  if (!Array.isArray(tournaments)) {
    throw new Error("tournaments must be an array");
  }
  if (!Array.isArray(syncItems)) throw new Error("syncItems must be an array");
  if (!Array.isArray(skipItems)) throw new Error("skipItems must be an array");
  const scope = new Set();
  for (const item of syncItems) {
    if (!item || typeof item !== "object" || !item.slug) throw new Error("write scope item slug missing");
    scope.add(item.slug);
  }

  if (!force) return scope;
  if (forceSlugs && forceSlugs.size > 0) {
    for (const slug of forceSlugs) scope.add(slug);
    return scope;
  }

  for (const tournament of tournaments) {
    if (!tournament?.slug) throw new Error("Tournament slug missing");
    scope.add(tournament.slug);
  }
  return scope;
}

export function buildScheduleBySlug(tournaments, scheduleMap) {
  if (!Array.isArray(tournaments)) {
    throw new Error("tournaments must be an array");
  }
  requireObject(scheduleMap, "analysis.scheduleMap");
  const tournamentIndexMap = new Map(tournaments.map((tournament, index) => [tournament.slug, index]));
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
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) throw new Error("analysis must be a JSON object");
  if (!analysis.globalStats || typeof analysis.globalStats !== "object" || Array.isArray(analysis.globalStats)) {
    throw new Error("analysis.globalStats must be a JSON object");
  }
  if (!analysis.timeGrid || typeof analysis.timeGrid !== "object" || Array.isArray(analysis.timeGrid)) {
    throw new Error("analysis.timeGrid must be a JSON object");
  }
  const stats = analysis.globalStats[slug];
  const timeGrid = analysis.timeGrid[slug];
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

export async function writeHomeProjections(env, tournaments, cache, analysis, writeScopeSlugs) {
  const scheduleBySlug = buildScheduleBySlug(tournaments, analysis.scheduleMap);

  await Promise.all(tournaments.map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    if (!writeScopeSlugs.has(slug)) return;
    const homeSnapshot = buildHomeSnapshot(tournament, cache, analysis, scheduleBySlug);
    await env["lol-stats-kv"].put(kvKeys.home(slug), JSON.stringify(homeSnapshot));
    cache.homes[slug] = homeSnapshot;
  }));
}
