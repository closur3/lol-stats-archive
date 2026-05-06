import { HTMLRenderer } from '../../render/htmlRenderer.js';
import { dateUtils } from '../../utils/dateUtils.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged } from '../../utils/kvStore.js';
import { generateArchiveStaticHTML } from './archiveBuilder.js';
import { UPDATE_CONFIG } from './types.js';

export async function refreshHomeStaticFromCache(env) {
  return rebuildStaticPagesFromCache(env, { includeArchive: false, requireData: false });
}

export async function rebuildStaticPagesFromCache(env, options = {}) {
  const includeArchive = options.includeArchive !== false;
  const requireData = options.requireData !== false;
  const kv = env["lol-stats-kv"];
  const maxScheduleDays = UPDATE_CONFIG.MAX_SCHEDULE_DAYS;
  const allHomeKeys = await kv.list({ prefix: kvKeys.HOME_PREFIX });
  const dataKeys = allHomeKeys.keys.map(key => key.name).filter(keyName => keyName !== kvKeys.homeStatic());
  const rawHomes = await Promise.all(dataKeys.map(key => env["lol-stats-kv"].get(key, { type: "json" })));
  const homeEntries = rawHomes.filter(home => home && home.tournament);
  if (homeEntries.length === 0) {
    if (requireData) return { ok: false, reason: "NO_CACHE", message: "No cache data available. Run Refresh API first." };
    return { ok: true, homes: 0, writes: 0, homeChanged: false, archiveChanged: false };
  }

  const sortedTournaments = dateUtils.sortTournamentsByDate(homeEntries.map(home => home.tournament));
  const runtimeConfig = { TOURNAMENTS: sortedTournaments };
  const tournamentIndexMap = new Map((sortedTournaments || []).map((tournament, index) => [tournament.slug, index]));
  const globalStats = {};
  const timeGrid = {};
  const scheduleMap = {};
  const tournamentMeta = {};

  homeEntries.forEach(home => {
    const homeTournament = home.tournament;
    const slug = homeTournament?.slug;
    if (!slug) return;
    if (home.stats) globalStats[slug] = home.stats;
    if (home.timeGrid) timeGrid[slug] = home.timeGrid;
    if (homeTournament && homeTournament.mode) {
      tournamentMeta[slug] = { mode: homeTournament.mode, emoji: homeTournament.emoji, hasHistoryUnfinished: homeTournament.hasHistoryUnfinished };
    }

    const schedule = home.scheduleMap || {};
    Object.keys(schedule).forEach(date => {
      if (!scheduleMap[date]) scheduleMap[date] = [];
      (schedule[date] || []).forEach(match => {
        const slug = match?.slug;
        const index = tournamentIndexMap.get(slug);
        if (index === undefined) return;
        scheduleMap[date].push({
          ...match,
          tournamentIndex: index
        });
      });
    });
  });

  Object.keys(scheduleMap).forEach(date => {
    scheduleMap[date].sort((leftMatch, rightMatch) => {
      const leftTournamentIndex = leftMatch.tournamentIndex;
      const rightTournamentIndex = rightMatch.tournamentIndex;
      if (leftTournamentIndex !== rightTournamentIndex) return leftTournamentIndex - rightTournamentIndex;
      return (leftMatch.time || "").localeCompare(rightMatch.time || "");
    });
  });

  const historyUnfinished = {};
  for (const [slug, meta] of Object.entries(tournamentMeta)) {
    if (meta.hasHistoryUnfinished) historyUnfinished[slug] = true;
  }

  const limitedScheduleMap = dateUtils.pruneScheduleMapByDayStatus(
    scheduleMap,
    maxScheduleDays,
    dateUtils.getNow().dateString,
    historyUnfinished
  );

  if (requireData && Object.keys(globalStats).length === 0) {
    return { ok: false, reason: "NO_CACHE", message: "No cache data available. Run Refresh API first." };
  }

  const homeFragment = HTMLRenderer.renderContentOnly(
    globalStats, timeGrid, limitedScheduleMap, runtimeConfig, false, tournamentMeta
  );
  const fullPage = HTMLRenderer.renderPageShell("LoL Stats", homeFragment, "home", env.GITHUB_TIME, env.GITHUB_SHA);
  const writePromises = [];
  let homeChanged = false;
  if (await kv.get(kvKeys.homeStatic()) !== fullPage) {
    writePromises.push(kvPutIfChanged(env, kvKeys.homeStatic(), fullPage));
    homeChanged = true;
  }

  let archiveChanged = false;
  if (includeArchive) {
    const archiveHTML = await generateArchiveStaticHTML(env);
    writePromises.push(kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML));
    archiveChanged = true;
  }

  await Promise.all(writePromises);
  return {
    ok: true,
    homes: homeEntries.length,
    writes: writePromises.length,
    homeChanged,
    archiveChanged
  };
}
