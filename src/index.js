import { HomeRouter } from './routes/home.js';
import { ArchiveRouter } from './routes/archive.js';
import { ToolsRouter } from './routes/tools.js';
import { APIRouter } from './routes/api.js';
import { Updater } from './core/updater.js';
import { HTMLRenderer } from './render/htmlRenderer.js';
import { KV_KEYS } from './utils/constants.js';

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
      
      case "/logs":
        const logs = await env.LOL_KV.get(KV_KEYS.LOGS, { type: "json" }) || [];
        const html = HTMLRenderer.renderLogPage(logs, time, sha);
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
    const logger = await updater.runUpdate(false);
    
    // 记录日志（仅当日志非空时）
    const newLogs = logger.export();
    if (newLogs.length > 0) {
      const oldLogs = await env.LOL_KV.get(KV_KEYS.LOGS, { type: "json" }) || [];
      let combinedLogs = [...newLogs, ...oldLogs];
      if (combinedLogs.length > 100) combinedLogs = combinedLogs.slice(0, 100);
      await env.LOL_KV.put(KV_KEYS.LOGS, JSON.stringify(combinedLogs));
    }
  }
};