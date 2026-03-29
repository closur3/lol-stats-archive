import { HomeRouter } from './routes/home.js';
import { ArchiveRouter } from './routes/archive.js';
import { ToolsRouter } from './routes/tools.js';
import { APIRouter } from './routes/api.js';
import { Updater } from './core/updater.js';
import { HTMLRenderer } from './render/htmlRenderer.js';
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
        const allHomeKeys = await env.LOL_KV.list({ prefix: KV_KEYS.HOME_PREFIX });
        const homes = [];
        await Promise.all(allHomeKeys.keys.filter(k => k.name !== KV_KEYS.HOME_STATIC_HTML).map(async k => {
          const home = await env.LOL_KV.get(k.name, { type: "json" });
          if (home && home.logs && home.logs.length > 0) homes.push(home);
        }));
        const sortedHomes = dateUtils.sortTournamentsByDate(homes.map(h => h.tourn || {}));
        const leagueLogs = {};
        sortedHomes.forEach(t => {
          const home = homes.find(h => h.tourn?.slug === t.slug);
          if (home) {
            const name = t.league || t.name || t.slug;
            const slug = t.slug;
            const meta = home.tournMeta?.[slug] || {};
            leagueLogs[name] = { logs: home.logs, mode: meta.mode || "fast" };
          }
        });
        const html = HTMLRenderer.renderLogPage(leagueLogs, time, sha);
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
    console.log("Scheduled event triggered");
    const updater = new Updater(env);
    await updater.runUpdate(false);
  }
};