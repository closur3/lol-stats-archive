import { HTMLRenderer } from '../render/htmlRenderer.js';
import { KV_KEYS } from '../utils/constants.js';
import { dateUtils } from '../utils/dateUtils.js';

/**
 * 工具页面路由处理
 */
export class ToolsRouter {
  /**
   * 处理工具页面请求
   */
  static async handleTools(request, env) {
    try {
      // 并行读取活跃赛事和归档赛事
      const [activeTournaments, existingArchives] = await Promise.all([
        (async () => {
          const allHomeKeys = await env["lol-stats-kv"].list({ prefix: KV_KEYS.HOME_PREFIX });
          const dataKeys = allHomeKeys.keys.filter(key => key.name !== KV_KEYS.HOME_STATIC_HTML);
          const rawHomes = await Promise.all(dataKeys.map(key => env["lol-stats-kv"].get(key.name, { type: "json" })));
          return rawHomes
            .map(home => home?.tournament)
            .filter(Boolean);
        })(),
        (async () => {
          const allKeys = await env["lol-stats-kv"].list({ prefix: KV_KEYS.ARCHIVE_PREFIX });
          const dataKeys = allKeys.keys.filter(key => key.name !== KV_KEYS.ARCHIVE_STATIC_HTML);
          const rawSnapshots = await Promise.all(dataKeys.map(key => env["lol-stats-kv"].get(key.name, { type: "json" })));
          return rawSnapshots
            .map(snapshot => snapshot?.tournament)
            .filter(Boolean);
        })()
      ]);

      const time = env.GITHUB_TIME;
      const sha = env.GITHUB_SHA;
      const html = HTMLRenderer.renderToolsPage(time, sha, activeTournaments, existingArchives);

      return new Response(html, {
        headers: { "content-type": "text/html;charset=utf-8" }
      });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}
