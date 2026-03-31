import { HomeRouter } from './routes/home.js';
import { ArchiveRouter } from './routes/archive.js';
import { ToolsRouter } from './routes/tools.js';
import { APIRouter } from './routes/api.js';
import { Updater } from './core/updater.js';
import { HTMLRenderer } from './render/htmlRenderer.js';
import { GitHubClient } from './api/githubClient.js';
import { KV_KEYS } from './utils/constants.js';
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
          for (const e of (logs || [])) {
            const msg = String(e?.m || "");
            if (msg.includes("🐌")) return "slow";
            if (msg.includes("⚡")) return "fast";
          }
          return "fast";
        };

        const allLogKeys = await env.LOL_KV.list({ prefix: "LOG_" });
        const logKeys = allLogKeys.keys.map(k => k.name);
        const logPairs = await Promise.all(logKeys.map(async key => {
          const slug = key.slice("LOG_".length);
          const logs = await env.LOL_KV.get(key, { type: "json" }) || [];
          return [slug, logs];
        }));
        const logsBySlug = new Map(logPairs.filter(([, logs]) => Array.isArray(logs) && logs.length > 0));
        const logSlugs = Array.from(logsBySlug.keys());
        const homePairs = await Promise.all(logSlugs.map(async slug => {
          const home = await env.LOL_KV.get(KV_KEYS.HOME_PREFIX + slug, { type: "json" });
          const total = Array.isArray(home?.rawMatches) ? home.rawMatches.length : null;
          return [slug, total];
        }));
        const totalBySlug = new Map(homePairs);

        let sortedTourns = [];
        try {
          const gh = new GitHubClient(env);
          const tourns = await gh.fetchJson("config/tour.json");
          sortedTourns = dateUtils.sortTournamentsByDate(Array.isArray(tourns) ? tourns : []);
        } catch (e) {}

        const leagueLogs = [];
        const consumed = new Set();
        for (const t of sortedTourns) {
          const slug = t?.slug;
          if (!slug || !logsBySlug.has(slug)) continue;
          const logs = logsBySlug.get(slug) || [];
          leagueLogs.push({
            name: t.league || t.name || slug,
            logs,
            mode: detectMode(logs),
            totalMatches: totalBySlug.get(slug) ?? null
          });
          consumed.add(slug);
        }

        const orphanSlugs = Array.from(logsBySlug.keys()).filter(s => !consumed.has(s)).sort();
        for (const slug of orphanSlugs) {
          const logs = logsBySlug.get(slug) || [];
          leagueLogs.push({ name: slug, logs, mode: detectMode(logs), totalMatches: totalBySlug.get(slug) ?? null });
        }

        const html = HTMLRenderer.renderLogPage(leagueLogs, time, sha, {
          slowThresholdMinutes: Number(env.SLOW_THRESHOLD_MINUTES) || 60,
          cronIntervalMinutes: Number(env.CRON_INTERVAL_MINUTES) || 3
        });
        return new Response(html, { 
          headers: { "content-type": "text/html;charset=utf-8" } 
        });
      
      case "/favicon.ico":
        return new Response(null, { status: 204 });
      
      default: 
        return new Response("404 Not Found", { status: 404 });
    }
  },

  async scheduled(event, env, ctx) {
    const updater = new Updater(env);
    await updater.runScheduledUpdate();
  }
};
