import { HTMLRenderer } from '../render/htmlRenderer.js';
import { KV_KEYS } from '../utils/constants.js';

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
        
        // 排序逻辑：start_date 倒序 > end_date 倒序 > slug 字母顺序
        existingArchives.sort((a, b) => {
          const aStart = a.start_date || '';
          const bStart = b.start_date || '';
          const aEnd = a.end_date || '';
          const bEnd = b.end_date || '';

          // 主要排序：start_date 倒序（日期越晚越靠前）
          if (aStart !== bStart) {
            if (!aStart) return 1; // 没有日期的排后面
            if (!bStart) return -1;
            return bStart.localeCompare(aStart);
          }

          // 第二排序：end_date 倒序
          if (aEnd !== bEnd) {
            if (!aEnd) return 1;
            if (!bEnd) return -1;
            return bEnd.localeCompare(aEnd);
          }

          // 第三排序：slug 字母顺序（确保稳定性）
          return (a.slug || '').localeCompare(b.slug || '');
        });
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