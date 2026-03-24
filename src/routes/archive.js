import { HTMLRenderer } from '../render/htmlRenderer.js';
import { Analyzer } from '../core/analyzer.js';
import { KV_KEYS } from '../utils/constants.js';

/**
 * 归档路由处理
 */
export class ArchiveRouter {
  /**
   * 处理归档页面请求
   */
  static async handleArchive(request, env) {
    const html = await env.LOL_KV.get(KV_KEYS.ARCHIVE_STATIC_HTML);
    if (html) {
      return new Response(html, { 
        headers: { "content-type": "text/html;charset=utf-8" } 
      });
    }
    
    return new Response(
      "Archive initializing... Please <a href='/tools'>run a Local UI Refresh</a> or wait for the next background update.", 
      { headers: { "content-type": "text/html;charset=utf-8" } }
    );
  }

  /**
   * 生成归档静态HTML
   */
  static async generateArchiveStaticHTML(env) {
    try {
      const allKeys = await env.LOL_KV.list({ prefix: "ARCHIVE_" });
      const dataKeys = allKeys.keys.filter(k => k.name !== KV_KEYS.ARCHIVE_STATIC_HTML);

      if (!dataKeys.length) {
        return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content arch-empty-msg">No archive data available.</div>`, "archive");
      }

      const rawSnapshots = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k.name, { type: "json" })));
      const validSnapshots = rawSnapshots.filter(s => s && s.tournament && s.tournament.slug);

      // 排序逻辑：start_date 倒序 > end_date 倒序 > slug 字母顺序
      validSnapshots.sort((a, b) => {
        const aStart = a.tournament.start_date || '';
        const bStart = b.tournament.start_date || '';
        const aEnd = a.tournament.end_date || '';
        const bEnd = b.tournament.end_date || '';

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
        return (a.tournament.slug || '').localeCompare(b.tournament.slug || '');
      });

      const combined = validSnapshots.map(snap => {
        const tournamentWithMap = { ...snap.tournament, team_map: snap.team_map || {} };
        const miniConfig = { TOURNAMENTS: [tournamentWithMap] };
        const analysis = Analyzer.runFullAnalysis({ [snap.tournament.slug]: snap.rawMatches || [] }, {}, miniConfig);
        const statsObj = analysis.globalStats[snap.tournament.slug] || {};
        const timeObj = analysis.timeGrid[snap.tournament.slug] || {};
        const content = HTMLRenderer.renderContentOnly(
          { [snap.tournament.slug]: statsObj },
          { [snap.tournament.slug]: timeObj },
          {}, miniConfig, true
        );
        return content;
      }).join("");

      return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content">${combined}</div>`, "archive");
    } catch (e) {
      return HTMLRenderer.renderPageShell("LoL Archive Error", `<div class="arch-error-msg">Error generating archive: ${e.message}</div>`, "archive");
    }
  }
}