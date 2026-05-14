import { dateUtils } from '../../utils/dateUtils.js';
import { timePolicy } from '../../utils/timePolicy.js';
import { ensureScheduleMetas } from '../facts/scheduleMetaStore.js';
import { UPDATE_CONFIG } from './types.js';

export async function loadScheduleMetaBySlug(env, sortedTournaments) {
  const scheduleMetas = await ensureScheduleMetas(env, sortedTournaments);
  return new Map(scheduleMetas.map(meta => [meta.slug, meta]));
}

function normalizeHomeScheduleMatch(match, tournamentIndexMap) {
  if (!match || typeof match !== "object" || Array.isArray(match)) {
    throw new Error("Invalid HOME schedule match");
  }
  if (!match.slug) throw new Error("HOME schedule match slug missing");
  if (typeof match.time !== "string") throw new Error(`HOME schedule match time missing: ${match.slug}`);
  const index = tournamentIndexMap.get(match.slug);
  if (index === undefined) throw new Error(`Unknown HOME schedule match slug: ${match.slug}`);
  return {
    ...match,
    tournamentIndex: index
  };
}

function appendHomeSchedule(scheduleMap, tournamentIndexMap, home) {
  const schedule = home.scheduleMap;
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    throw new Error(`Invalid HOME scheduleMap: ${home.tournament.slug}`);
  }
  for (const [date, matches] of Object.entries(schedule)) {
    if (!Array.isArray(matches)) throw new Error(`Invalid HOME schedule date: ${home.tournament.slug}:${date}`);
    if (!scheduleMap[date]) scheduleMap[date] = [];
    for (const match of matches) {
      scheduleMap[date].push(normalizeHomeScheduleMatch(match, tournamentIndexMap));
    }
  }
}

export function buildStaticRenderInput(homeEntries, sortedTournaments, scheduleMetaBySlug) {
  if (!Array.isArray(homeEntries)) throw new Error("homeEntries must be an array");
  if (!Array.isArray(sortedTournaments)) throw new Error("sortedTournaments must be an array");
  if (!(scheduleMetaBySlug instanceof Map)) throw new Error("scheduleMetaBySlug must be a Map");
  const runtimeConfig = { TOURNAMENTS: sortedTournaments };
  const tournamentIndexMap = new Map(sortedTournaments.map((tournament, index) => [tournament.slug, index]));
  const globalStats = {};
  const timeGrid = {};
  const scheduleMap = {};
  const tournamentMeta = {};

  for (const home of homeEntries) {
    const slug = home.tournament.slug;
    globalStats[slug] = home.stats;
    timeGrid[slug] = home.timeGrid;
    const meta = scheduleMetaBySlug.get(slug);
    if (!meta) throw new Error(`SCHEDULE_META missing after load: ${slug}`);
    tournamentMeta[slug] = meta;

    appendHomeSchedule(scheduleMap, tournamentIndexMap, home);
  }

  for (const date of Object.keys(scheduleMap)) {
    scheduleMap[date].sort((leftMatch, rightMatch) => {
      const leftTournamentIndex = leftMatch.tournamentIndex;
      const rightTournamentIndex = rightMatch.tournamentIndex;
      if (leftTournamentIndex !== rightTournamentIndex) return leftTournamentIndex - rightTournamentIndex;
      return leftMatch.time.localeCompare(rightMatch.time);
    });
  }

  return { runtimeConfig, globalStats, timeGrid, scheduleMap, tournamentMeta };
}

export function pruneStaticSchedule(scheduleMap, tournamentMeta) {
  const historyUnfinished = {};
  for (const [slug, meta] of Object.entries(tournamentMeta)) {
    if (meta.hasHistoryUnfinished) historyUnfinished[slug] = true;
  }

  return dateUtils.pruneScheduleMapByDayStatus(
    scheduleMap,
    UPDATE_CONFIG.MAX_SCHEDULE_DAYS,
    timePolicy.getNow().dateString,
    historyUnfinished
  );
}
