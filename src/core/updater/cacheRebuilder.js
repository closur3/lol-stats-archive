import { HTMLRenderer } from '../../render/htmlRenderer.js';
import { dateUtils } from '../../utils/dateUtils.js';
import { timePolicy } from '../../utils/timePolicy.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged } from '../../utils/kvStore.js';
import { generateArchiveStaticHTML } from './archiveBuilder.js';
import { UPDATE_CONFIG } from './types.js';
import { readScheduleMetas } from '../facts/scheduleMetaStore.js';

export async function refreshHomeStaticFromCache(env) {
  return rebuildStaticPagesFromCache(env, { includeArchive: false, requireData: false });
}

function assertHomeSnapshot(keyName, home) {
  if (!home || typeof home !== "object" || Array.isArray(home)) {
    throw new Error(`Invalid HOME snapshot: ${keyName}`);
  }
  if (!home.tournament || typeof home.tournament !== "object" || !home.tournament.slug) {
    throw new Error(`Invalid HOME tournament: ${keyName}`);
  }
  if (!home.stats || typeof home.stats !== "object" || Array.isArray(home.stats)) {
    throw new Error(`Invalid HOME stats: ${keyName}`);
  }
  if (!home.timeGrid || typeof home.timeGrid !== "object" || Array.isArray(home.timeGrid)) {
    throw new Error(`Invalid HOME timeGrid: ${keyName}`);
  }
  if (!home.scheduleMap || typeof home.scheduleMap !== "object" || Array.isArray(home.scheduleMap)) {
    throw new Error(`Invalid HOME scheduleMap: ${keyName}`);
  }
}

export async function rebuildStaticPagesFromCache(env, options = {}) {
  const includeArchive = options.includeArchive !== false;
  const requireData = options.requireData !== false;
  const kv = env["lol-stats-kv"];
  const maxScheduleDays = UPDATE_CONFIG.MAX_SCHEDULE_DAYS;
  const allHomeKeys = await kv.list({ prefix: kvKeys.HOME_PREFIX });
  const dataKeys = allHomeKeys.keys.map(key => key.name).filter(keyName => keyName !== kvKeys.homeStatic());
  const rawHomes = await Promise.all(dataKeys.map(key => env["lol-stats-kv"].get(key, { type: "json" })));
  const homeEntries = rawHomes.map((home, index) => {
    assertHomeSnapshot(dataKeys[index], home);
    return home;
  });
  const writePromises = [];
  let homeChanged = false;
  let archiveChanged = false;

  if (homeEntries.length === 0) {
    if (includeArchive) {
      const archiveHTML = await generateArchiveStaticHTML(env);
      writePromises.push(kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML));
      archiveChanged = true;
    }
    if (writePromises.length === 0 && requireData) {
      return { ok: false, reason: "NO_CACHE", message: "No HOME cache data available. Run Force Update first." };
    }
    await Promise.all(writePromises);
    return { ok: true, homes: 0, writes: writePromises.length, homeChanged, archiveChanged };
  }

  const sortedTournaments = dateUtils.sortTournamentsByDate(homeEntries.map(home => home.tournament));
  const runtimeConfig = { TOURNAMENTS: sortedTournaments };
  const scheduleMetas = await readScheduleMetas(env, sortedTournaments);
  const scheduleMetaBySlug = new Map(scheduleMetas.map(meta => [meta.slug, meta]));
  const tournamentIndexMap = new Map((sortedTournaments || []).map((tournament, index) => [tournament.slug, index]));
  const globalStats = {};
  const timeGrid = {};
  const scheduleMap = {};
  const tournamentMeta = {};

  homeEntries.forEach(home => {
    const homeTournament = home.tournament;
    const slug = homeTournament?.slug;
    if (home.stats) globalStats[slug] = home.stats;
    timeGrid[slug] = home.timeGrid;
    tournamentMeta[slug] = scheduleMetaBySlug.get(slug) || {};

    const schedule = home.scheduleMap;
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
    timePolicy.getNow().dateString,
    historyUnfinished
  );

  if (requireData && Object.keys(globalStats).length === 0) {
    return { ok: false, reason: "NO_CACHE", message: "No HOME stats cache data available. Run Force Update first." };
  }

  const homeFragment = HTMLRenderer.renderContentOnly(
    globalStats, timeGrid, limitedScheduleMap, runtimeConfig, false, tournamentMeta
  );
  const fullPage = HTMLRenderer.renderPageShell("LoL Stats", homeFragment, "home", env.GITHUB_TIME, env.GITHUB_SHA);
  if (await kv.get(kvKeys.homeStatic()) !== fullPage) {
    writePromises.push(kvPutIfChanged(env, kvKeys.homeStatic(), fullPage));
    homeChanged = true;
  }

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
