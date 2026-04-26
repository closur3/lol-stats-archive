import { HomeRouter } from './routes/home.js';
import { ArchiveRouter } from './routes/archive.js';
import { ToolsRouter } from './routes/tools.js';
import { APIRouter } from './routes/api.js';
import { Updater, UPDATE_CONFIG } from './core/updater.js';
import { HTMLRenderer } from './render/htmlRenderer.js';
import { GitHubClient } from './api/githubClient.js';
import { kvKeys } from './infrastructure/kv/keyFactory.js';
import { dateUtils } from './utils/dateUtils.js';

/**
 * 主Worker入口
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const time = env.GITHUB_TIME;
    const sha = env.GITHUB_SHA;

    switch (url.pathname) {
      case "/":
        return HomeRouter.handleHome(request, env);
      
      case "/archive":
        return ArchiveRouter.handleArchive(request, env);
      
      case "/tools":
        return ToolsRouter.handleTools(request, env);
      
      case "/backup":
        return APIRouter.handleBackup(request, env);
      
      case "/force":
        return APIRouter.handleForceUpdate(request, env);
      
      case "/refresh-ui":
        return APIRouter.handleRefreshUI(request, env);

      case "/rebuild-archive":
        return APIRouter.handleRebuildArchive(request, env);
      
      case "/delete-archive":
        return APIRouter.handleDeleteArchive(request, env);
      
      case "/manual-archive":
        return APIRouter.handleManualArchive(request, env);

      case "/logs": {
        const kv = env["lol-stats-kv"];
        const allLogKeys = await kv.list({ prefix: kvKeys.LOG_PREFIX });
        const logKeys = allLogKeys.keys.map(logKey => logKey.name);
        const logPairs = await Promise.all(logKeys.map(async key => {
          const slug = key.slice(kvKeys.LOG_PREFIX.length);
          const logs = await kv.get(key, { type: "json" }) || [];
          return [slug, logs];
        }));
        const logsBySlug = new Map(logPairs.filter(([, logs]) => Array.isArray(logs) && logs.length > 0));
        const logSlugs = Array.from(logsBySlug.keys());
        const homePairs = await Promise.all(logSlugs.map(async slug => {
          const home = await kv.get(kvKeys.home(slug), { type: "json" });
          const totalMatchCount = Array.isArray(home?.rawMatches) ? home.rawMatches.length : null;
          const metaMode = home?.tournament?.mode;
          const mode = metaMode === "slow" || metaMode === "fast" ? metaMode : null;
          return [slug, { totalMatchCount, mode }];
        }));
        const homeBySlug = new Map(homePairs);

        let sortedTournaments = [];
        try {
          const githubClient = new GitHubClient(env);
          const tournaments = await githubClient.fetchJson("config/tour.json");
          sortedTournaments = dateUtils.sortTournamentsByDate(Array.isArray(tournaments) ? tournaments : []);
        } catch (error) { console.error("[Logs] Failed to load tournaments config:", error.message); }

        const leagueLogs = [];
        const consumed = new Set();
        for (const tournament of sortedTournaments) {
          const slug = tournament?.slug;
          if (!slug || !logsBySlug.has(slug)) continue;
          const logs = logsBySlug.get(slug) || [];
          leagueLogs.push({
            name: tournament.league || tournament.name || slug,
            logs,
            mode: homeBySlug.get(slug)?.mode,
            totalMatches: homeBySlug.get(slug)?.totalMatchCount ?? null
          });
          consumed.add(slug);
        }

        const orphanSlugs = Array.from(logsBySlug.keys()).filter(slug => !consumed.has(slug)).sort();
        for (const slug of orphanSlugs) {
          const logs = logsBySlug.get(slug) || [];
          leagueLogs.push({
            name: slug,
            logs,
            mode: homeBySlug.get(slug)?.mode,
            totalMatches: homeBySlug.get(slug)?.totalMatchCount ?? null
          });
        }

        const html = HTMLRenderer.renderLogPage(leagueLogs, time, sha, {
          slowThresholdMinutes: UPDATE_CONFIG.SLOW_THRESHOLD_MINUTES,
          cronIntervalMinutes: UPDATE_CONFIG.CRON_INTERVAL_MINUTES
        });
        return new Response(html, { 
          headers: {
            "content-type": "text/html;charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate"
          }
        });
      }
      
      case "/favicon.ico":
        return new Response(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>🥇</text></svg>`, {
          headers: { "content-type": "image/svg+xml" }
        });
      
      default: 
        return new Response("404 Not Found", { status: 404 });
    }
  },

  async scheduled(event, env) {
    const updater = new Updater(env);
    await updater.runScheduledUpdate();
  }
};
