import { HomeRouter } from './routes/home.js';
import { ArchiveRouter } from './routes/archive.js';
import { ToolsRouter } from './routes/tools.js';
import { APIRouter } from './routes/api.js';
import { Updater } from './core/updater.js';
import { HTMLRenderer } from './render/htmlRenderer.js';
import { GitHubClient } from './api/githubClient.js';
import { KV_KEYS } from './utils/constants.js';
import { readMetaState } from './utils/Meta.js';
import { dateUtils } from './utils/dateUtils.js';

/**
 * 主Worker入口
 */
export default {
  async fetch(request, env, ctx) {
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
      
      case "/mode-overrides":
        if (request.method === "POST") {
          return APIRouter.handleSetModeOverrides(request, env);
        }
        return APIRouter.handleGetModeOverrides(request, env);
      
      case "/logs":
        const detectMode = (logs) => {
          for (const logEntry of (logs || [])) {
            const logMessage = String(logEntry?.message || "");
            const switchMatch = logMessage.match(/(⚡->🐌|🐌->⚡)/);
            if (switchMatch) {
              return switchMatch[1].endsWith("🐌") ? "slow" : "fast";
            }
            if (logMessage.includes("⚡")) return "fast";
            if (logMessage.includes("🐌")) return "slow";
          }
          return "fast";
        };

        const allLogKeys = await env["lol-stats-kv"].list({ prefix: "LOG_" });
        const logKeys = allLogKeys.keys.map(logKey => logKey.name);
        const logPairs = await Promise.all(logKeys.map(async key => {
          const slug = key.slice("LOG_".length);
          const logs = await env["lol-stats-kv"].get(key, { type: "json" }) || [];
          return [slug, logs];
        }));
        const logsBySlug = new Map(logPairs.filter(([, logs]) => Array.isArray(logs) && logs.length > 0));
        const logSlugs = Array.from(logsBySlug.keys());
        const metaState = await readMetaState(env);
        const homePairs = await Promise.all(logSlugs.map(async slug => {
          const home = await env["lol-stats-kv"].get(KV_KEYS.HOME_PREFIX + slug, { type: "json" });
          const totalMatchCount = Array.isArray(home?.rawMatches) ? home.rawMatches.length : null;
          const metaMode = metaState?.tournaments?.[slug]?.mode;
          const mode = metaMode === "slow" || metaMode === "fast" ? metaMode : null;
          return [slug, { totalMatchCount, mode }];
        }));
        const homeBySlug = new Map(homePairs);

        let sortedTournaments = [];
        try {
          const githubClient = new GitHubClient(env);
          const tournaments = await githubClient.fetchJson("config/tour.json");
          sortedTournaments = dateUtils.sortTournamentsByDate(Array.isArray(tournaments) ? tournaments : []);
        } catch (error) {}

        const leagueLogs = [];
        const consumed = new Set();
        for (const tournament of sortedTournaments) {
          const slug = tournament?.slug;
          if (!slug || !logsBySlug.has(slug)) continue;
          const logs = logsBySlug.get(slug) || [];
          leagueLogs.push({
            name: tournament.league || tournament.name || slug,
            logs,
            mode: homeBySlug.get(slug)?.mode || detectMode(logs),
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
            mode: homeBySlug.get(slug)?.mode || detectMode(logs),
            totalMatches: homeBySlug.get(slug)?.totalMatchCount ?? null
          });
        }

        const html = HTMLRenderer.renderLogPage(leagueLogs, time, sha, {
          slowThresholdMinutes: Number(env.SLOW_THRESHOLD_MINUTES) || 60,
          cronIntervalMinutes: Number(env.CRON_INTERVAL_MINUTES) || 3
        });
        return new Response(html, { 
          headers: {
            "content-type": "text/html;charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate"
          }
        });
      
      case "/favicon.ico":
        return new Response(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>🥇</text></svg>`, {
          headers: {
            "content-type": "image/svg+xml",
            "cache-control": "no-cache, no-store, must-revalidate"
          }
        });
      
      default: 
        return new Response("404 Not Found", { status: 404 });
    }
  },

  async scheduled(event, env, ctx) {
    const updater = new Updater(env);
    await updater.runScheduledUpdate();
  }
};
