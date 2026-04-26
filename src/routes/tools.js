import { HTMLRenderer } from '../render/htmlRenderer.js';
import { kvKeys } from '../infrastructure/kv/keyFactory.js';
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
      const kv = env["lol-stats-kv"];
      // 并行读取活跃赛事和归档赛事
      const [activeTournaments, archivedTournaments] = await Promise.all([
      (async () => {
        const allHomeKeys = await kv.list({ prefix: kvKeys.HOME_PREFIX });
        const dataKeys = allHomeKeys.keys.filter(key => key.name !== kvKeys.homeStatic());
        const rawHomes = await Promise.all(dataKeys.map(key => kv.get(key.name, { type: "json" })));
        const tournaments = rawHomes
          .map(home => home?.tournament)
          .filter(Boolean);
        return dateUtils.sortTournamentsByDate(tournaments);
      })(),
      (async () => {
        const allKeys = await kv.list({ prefix: kvKeys.ARCHIVE_PREFIX });
        const dataKeys = allKeys.keys.filter(key => key.name !== kvKeys.archiveStatic());
        const rawSnapshots = await Promise.all(dataKeys.map(key => kv.get(key.name, { type: "json" })));
        const tournaments = rawSnapshots
          .map(snapshot => snapshot?.tournament)
          .filter(Boolean);
        return dateUtils.sortTournamentsByDate(tournaments);
      })()
      ]);

      const time = env.GITHUB_TIME;
      const sha = env.GITHUB_SHA;
      const html = HTMLRenderer.renderToolsPage(time, sha, activeTournaments, archivedTournaments);

      return new Response(html, {
        headers: { "content-type": "text/html;charset=utf-8" }
      });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}
