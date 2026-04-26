import { HTMLRenderer } from '../../render/htmlRenderer.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPut, kvPutIfChanged } from '../../utils/kvStore.js';
import { formatLogEntry } from './logWriter.js';
import { generateArchiveStaticHTML } from './archiveBuilder.js';
import { UPDATE_CONFIG } from './types.js';

export async function saveData(env, runtimeConfig, cache, analysis, syncItems, idleItems = [], force = false, forceSlugs = null, leagueLogEntries = {}) {
  const analyzedTournamentMeta = analysis.tournamentMeta || {};

  try {
    const homeFragment = HTMLRenderer.renderContentOnly(
      analysis.globalStats, analysis.timeGrid, analysis.scheduleMap,
      runtimeConfig, false, analyzedTournamentMeta
    );
    const fullPage = HTMLRenderer.renderPageShell("LoL Stats", homeFragment, "home", env.GITHUB_TIME, env.GITHUB_SHA);
    await kvPutIfChanged(env, kvKeys.homeStatic(), fullPage);
  } catch (error) {
    console.error("Error generating home HTML:", error);
  }

  const kv = env["lol-stats-kv"];
  const tournamentIndexMap = new Map((runtimeConfig.TOURNAMENTS || []).map((tournament, index) => [tournament.slug, index]));
  const scheduleBySlug = {};
  Object.keys(analysis.scheduleMap || {}).forEach(date => {
    const list = analysis.scheduleMap[date] || [];
    list.forEach(match => {
      const slug = match.slug;
      const normalizedMatch = {
        ...match,
        tournamentIndex: tournamentIndexMap.has(slug)
          ? tournamentIndexMap.get(slug)
          : (match.tournamentIndex ?? 9999)
      };
      if (!scheduleBySlug[slug]) scheduleBySlug[slug] = {};
      if (!scheduleBySlug[slug][date]) scheduleBySlug[slug][date] = [];
      scheduleBySlug[slug][date].push(normalizedMatch);
    });
  });

  const changedSlugSet = new Set((syncItems || []).map(item => item?.slug).filter(Boolean));
  const idleSlugSet = new Set((idleItems || []).map(item => item?.slug).filter(Boolean));
  const writeScopeSlugSet = new Set([...changedSlugSet, ...idleSlugSet]);
  if (force) {
    if (forceSlugs && forceSlugs.size > 0) {
      for (const slug of forceSlugs) writeScopeSlugSet.add(slug);
    } else {
      for (const tournament of (runtimeConfig.TOURNAMENTS || [])) {
        if (tournament?.slug) writeScopeSlugSet.add(tournament.slug);
      }
    }
  }

  const existingHomeList = await kv.list({ prefix: kvKeys.HOME_PREFIX });
  const existingHomeKeySet = new Set(existingHomeList.keys.map(key => key.name));

  const writePromises = [];
  const writeTargets = [];
  for (const tournament of runtimeConfig.TOURNAMENTS) {
    const slug = tournament.slug;
    const isForceTarget = force && (!forceSlugs || forceSlugs.has(slug));
    const raw = cache.rawMatches[slug] || [];
    const stats = analysis.globalStats[slug] || {};
    const grid = analysis.timeGrid[slug] || {};

    const { teamMap, ...tournamentStored } = tournament;

    const homeKey = kvKeys.home(slug);
    const homeSnapshot = {
      tournament: { ...tournamentStored, ...(analyzedTournamentMeta[slug] || {}) },
      rawMatches: raw,
      stats: stats,
      timeGrid: grid,
      scheduleMap: scheduleBySlug[slug] || {},
      teamMap: teamMap
    };

    const shouldBackfillMissing = !existingHomeKeySet.has(homeKey);
    const homeHasChanges = isForceTarget || writeScopeSlugSet.has(slug) || shouldBackfillMissing;

    if (homeHasChanges) {
      writeTargets.push({ key: homeKey, slug });
      writePromises.push(kvPutIfChanged(env, homeKey, homeSnapshot));
    }
  }

  const writeResults = await Promise.allSettled(writePromises);
  const failedWrites = writeResults.filter(r => r.status === 'rejected');
  const failedHomeSlugs = new Set();
  
  if (failedWrites.length > 0) {
    writeResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        const target = writeTargets[index];
        const key = target?.key || "UNKNOWN_HOME_KEY";
        if (key.startsWith(kvKeys.HOME_PREFIX)) {
          const slug = key.slice(kvKeys.HOME_PREFIX.length);
          failedHomeSlugs.add(slug);
        }
        console.error(`[KV-WRITE-FAIL] ${key}: ${result.reason?.message || result.reason}`);
      }
    });
  }

  const logEntries = leagueLogEntries || {};
  const logWrites = Object.entries(logEntries).map(async ([slug, entry]) => {
    if (!slug || !entry) return;
    const logKey = kvKeys.log(slug);
    const oldLogs = await kv.get(logKey, { type: "json" }) || [];
    const logEntry = { ...entry, message: formatLogEntry(entry) };
    const nextLogs = [logEntry, ...oldLogs].slice(0, UPDATE_CONFIG.MAX_LOG_ENTRIES);
    await kvPut(env, logKey, JSON.stringify(nextLogs));
  });
  if (logWrites.length > 0) {
    const logResults = await Promise.allSettled(logWrites);
    const failedLogs = logResults.filter(r => r.status === 'rejected');
    if (failedLogs.length > 0) {
      console.error(`[KV] ${failedLogs.length} log write(s) failed:`, failedLogs.map(r => r.reason?.message || r.reason));
    }
  }

  if (syncItems.length > 0) {
    try {
      const archiveHTML = await generateArchiveStaticHTML(env);
      await kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML);
    } catch (error) {
      console.error("Error generating archive HTML:", error);
    }
  }

  return { failedHomeSlugs };
}