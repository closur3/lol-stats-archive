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
      // 读取现有归档
      let existingArchives = [];
      try {
        const allKeys = await env.LOL_KV.list({ prefix: "ARCHIVE_" });
        const dataKeys = allKeys.keys.filter(k => k.name !== KV_KEYS.ARCHIVE_STATIC_HTML);
        const rawSnapshots = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k.name, { type: "json" })));
        existingArchives = rawSnapshots.filter(s => s && s.tourn).map(s => s.tourn);
        existingArchives = dateUtils.sortTournamentsByDate(existingArchives);
      } catch(e) {
        console.error("Error fetching archives for tools page", e);
      }

      const time = env.GITHUB_TIME;
      const sha = env.GITHUB_SHA;
      const html = HTMLRenderer.renderToolsPage(time, sha, existingArchives);
      
      return new Response(html, { 
        headers: { "content-type": "text/html;charset=utf-8" } 
      });
    } catch (e) {
      return new Response(`Error: ${e.message}`, { status: 500 });
    }
  }
}
