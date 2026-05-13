import { GitHubClient } from '../api/githubClient.js';
import { UPDATE_CONFIG } from '../core/updater/types.js';
import { loadTourConfig } from '../core/updater/tourConfigLoader.js';
import { kvKeys } from '../infrastructure/kv/keyFactory.js';
import { HTMLRenderer } from '../render/htmlRenderer.js';
import { dateUtils } from '../utils/dateUtils.js';

async function loadSortedTournaments(env) {
  const githubClient = new GitHubClient(env);
  const tournaments = await loadTourConfig(env, githubClient);
  return dateUtils.sortTournamentsByDate(tournaments);
}

async function loadLogsBySlug(kv) {
  const allLogKeys = await kv.list({ prefix: kvKeys.LOG_PREFIX });
  const logPairs = await Promise.all(allLogKeys.keys.map(async logKey => {
    const slug = logKey.name.slice(kvKeys.LOG_PREFIX.length);
    const logs = await kv.get(logKey.name, { type: "json" }) || [];
    return [slug, logs];
  }));
  return new Map(logPairs.filter(([, logs]) => Array.isArray(logs) && logs.length > 0));
}

async function loadHomeMetaBySlug(kv, slugs) {
  const homePairs = await Promise.all(slugs.map(async slug => {
    const home = await kv.get(kvKeys.home(slug), { type: "json" });
    const totalMatchCount = Array.isArray(home?.rawMatches) ? home.rawMatches.length : null;
    const meta = home?.tournament || {};
    return [slug, {
      totalMatchCount,
      todayEarliestTimestamp: Number(meta.todayEarliestTimestamp) || 0,
      todayUnfinished: Number(meta.todayUnfinished) || 0,
      hasHistoryUnfinished: !!meta.hasHistoryUnfinished
    }];
  }));
  return new Map(homePairs);
}

function buildLeagueLogItem(name, slug, logs, homeMeta) {
  return {
    name,
    logs,
    totalMatches: homeMeta?.totalMatchCount ?? null,
    todayEarliestTimestamp: homeMeta?.todayEarliestTimestamp ?? 0,
    todayUnfinished: homeMeta?.todayUnfinished ?? 0,
    hasHistoryUnfinished: homeMeta?.hasHistoryUnfinished ?? false
  };
}

function buildLeagueLogs(sortedTournaments, logsBySlug, homeBySlug) {
  const leagueLogs = [];
  const consumed = new Set();

  for (const tournament of sortedTournaments) {
    const slug = tournament?.slug;
    if (!slug || !logsBySlug.has(slug)) continue;
    leagueLogs.push(buildLeagueLogItem(
      tournament.league || tournament.name || slug,
      slug,
      logsBySlug.get(slug) || [],
      homeBySlug.get(slug)
    ));
    consumed.add(slug);
  }

  const orphanSlugs = Array.from(logsBySlug.keys()).filter(slug => !consumed.has(slug)).sort();
  for (const slug of orphanSlugs) {
    leagueLogs.push(buildLeagueLogItem(slug, slug, logsBySlug.get(slug) || [], homeBySlug.get(slug)));
  }

  return leagueLogs;
}

export class LogsRouter {
  static async handleLogs(_request, env) {
    const kv = env["lol-stats-kv"];
    const logsBySlug = await loadLogsBySlug(kv);
    const logSlugs = Array.from(logsBySlug.keys());
    const [homeBySlug, sortedTournaments] = await Promise.all([
      loadHomeMetaBySlug(kv, logSlugs),
      loadSortedTournaments(env)
    ]);
    const leagueLogs = buildLeagueLogs(sortedTournaments, logsBySlug, homeBySlug);
    const html = HTMLRenderer.renderLogPage(leagueLogs, env.GITHUB_TIME, env.GITHUB_SHA, {
      maxLogEntries: UPDATE_CONFIG.MAX_LOG_ENTRIES
    });

    return new Response(html, {
      headers: {
        "content-type": "text/html;charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate"
      }
    });
  }
}
