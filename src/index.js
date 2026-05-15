import { HomeRouter } from './routes/home.js';
import { ArchiveRouter } from './routes/archive.js';
import { ToolsRouter } from './routes/tools.js';
import { LogsRouter } from './routes/logs.js';
import { APIRouter } from './routes/api.js';
import { runCron } from './core/cron/orchestrator.js';

/**
 * 主Worker入口
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
      
      case "/rebuild-archive":
        return APIRouter.handleRebuildArchive(request, env);
      
      case "/delete-archive":
        return APIRouter.handleDeleteArchive(request, env);
      
      case "/manual-archive":
        return APIRouter.handleManualArchive(request, env);

      case "/logs":
        return LogsRouter.handleLogs(request, env);
      
      case "/favicon.ico":
        return new Response(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='.9em' font-size='85' text-anchor='middle'>🥇</text></svg>`, {
          headers: { "content-type": "image/svg+xml" }
        });
      
      default: 
        return new Response("404 Not Found", { status: 404 });
    }
  },

  async scheduled(event, env) {
    await runCron(env, event);
  }
};
