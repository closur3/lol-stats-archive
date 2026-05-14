import { HTMLRenderer } from '../../render/htmlRenderer.js';
import { dateUtils } from '../../utils/dateUtils.js';
import { timePolicy } from '../../utils/timePolicy.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged } from '../../utils/kvStore.js';
import { generateArchiveStaticHTML } from './archiveBuilder.js';
import { UPDATE_CONFIG } from './types.js';
import { ensureScheduleMetas } from '../facts/scheduleMetaStore.js';

export async function refreshHomeStaticFromCache(env) {
  return rebuildStaticPagesFromCache(env, { includeArchive: false, requireData: false });
}

function normalizeStaticRebuildOptions(options) {
  return {
    includeArchive: options.includeArchive !== false,
    requireData: options.requireData !== false
  };
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

async function readHomeEntries(env) {
  const kv = env["lol-stats-kv"];
  const allHomeKeys = await kv.list({ prefix: kvKeys.HOME_PREFIX });
  const dataKeys = allHomeKeys.keys.map(key => key.name).filter(keyName => keyName !== kvKeys.homeStatic());
  const rawHomes = await Promise.all(dataKeys.map(key => env["lol-stats-kv"].get(key, { type: "json" })));
  return rawHomes.map((home, index) => {
    assertHomeSnapshot(dataKeys[index], home);
    return home;
  });
}

async function writeEmptyStaticPages(env, includeArchive, requireData) {
  const writePromises = [];
  let homeChanged = false;
  let archiveChanged = false;

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

async function loadScheduleMetaBySlug(env, sortedTournaments) {
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
  for (const [date, matches] of Object.entries(schedule)) {
    if (!Array.isArray(matches)) throw new Error(`Invalid HOME schedule date: ${home.tournament.slug}:${date}`);
    if (!scheduleMap[date]) scheduleMap[date] = [];
    for (const match of matches) {
      scheduleMap[date].push(normalizeHomeScheduleMatch(match, tournamentIndexMap));
    }
  }
}

function buildStaticRenderInput(homeEntries, sortedTournaments, scheduleMetaBySlug) {
  const runtimeConfig = { TOURNAMENTS: sortedTournaments };
  const tournamentIndexMap = new Map(sortedTournaments.map((tournament, index) => [tournament.slug, index]));
  const globalStats = {};
  const timeGrid = {};
  const scheduleMap = {};
  const tournamentMeta = {};

  for (const home of homeEntries) {
    const homeTournament = home.tournament;
    const slug = homeTournament.slug;
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

function pruneStaticSchedule(scheduleMap, tournamentMeta) {
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

async function writeStaticPages(env, homeEntries, renderInput, includeArchive) {
  const kv = env["lol-stats-kv"];
  const writePromises = [];
  let homeChanged = false;
  let archiveChanged = false;

  const limitedScheduleMap = pruneStaticSchedule(renderInput.scheduleMap, renderInput.tournamentMeta);

  const homeFragment = HTMLRenderer.renderContentOnly(
    renderInput.globalStats,
    renderInput.timeGrid,
    limitedScheduleMap,
    renderInput.runtimeConfig,
    false,
    renderInput.tournamentMeta
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

export async function rebuildStaticPagesFromCache(env, options = {}) {
  const { includeArchive, requireData } = normalizeStaticRebuildOptions(options);
  const homeEntries = await readHomeEntries(env);

  if (homeEntries.length === 0) {
    return writeEmptyStaticPages(env, includeArchive, requireData);
  }

  const sortedTournaments = dateUtils.sortTournamentsByDate(homeEntries.map(home => home.tournament));
  const scheduleMetaBySlug = await loadScheduleMetaBySlug(env, sortedTournaments);
  const renderInput = buildStaticRenderInput(homeEntries, sortedTournaments, scheduleMetaBySlug);

  if (requireData && Object.keys(renderInput.globalStats).length === 0) {
    return { ok: false, reason: "NO_CACHE", message: "No HOME stats cache data available. Run Force Update first." };
  }

  return writeStaticPages(env, homeEntries, renderInput, includeArchive);
}
