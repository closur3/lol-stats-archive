import { HTMLRenderer } from '../render/htmlRenderer.js';
import { Analyzer } from '../core/analyzer.js';
import { dataUtils } from '../utils/dataUtils.js';
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
      const validSnapshots = rawSnapshots.filter(s => s && s.tourn && s.tourn.slug);

      validSnapshots = dataUtils.sortTournamentsByDate(validSnapshots);

      const combined = validSnapshots.map(snap => {
        const tournamentWithMap = { ...snap.tourn, team_map: snap.team_map || {} };
        const miniConfig = { TOURNAMENTS: [tournamentWithMap] };
        const analysis = Analyzer.runFullAnalysis({ [snap.tourn.slug]: snap.rawMatches || [] }, {}, miniConfig);
        const statsObj = analysis.globalStats[snap.tourn.slug] || {};
        const timeObj = analysis.timeGrid[snap.tourn.slug] || {};
        const content = HTMLRenderer.renderContentOnly(
          { [snap.tourn.slug]: statsObj },
          { [snap.tourn.slug]: timeObj },
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