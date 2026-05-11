import { HTMLRenderer } from '../render/htmlRenderer.js';
import { GitHubClient } from '../api/githubClient.js';
import { loadArchiveConfig } from '../core/updater/archiveIndex.js';
import { loadTourConfig } from '../core/updater/tourConfigLoader.js';
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
      const [activeTournaments, archiveResult] = await Promise.all([
      (async () => {
        const githubClient = new GitHubClient(env);
        const tournaments = await loadTourConfig(env, githubClient);
        return dateUtils.sortTournamentsByDate(tournaments);
      })(),
      (async () => {
        try {
          const githubClient = new GitHubClient(env);
          return { archivedTournaments: await loadArchiveConfig(env, githubClient), archiveError: null };
        } catch (error) {
          return { archivedTournaments: [], archiveError: error.message };
        }
      })()
      ]);

      const time = env.GITHUB_TIME;
      const sha = env.GITHUB_SHA;
      const html = HTMLRenderer.renderToolsPage(
        time,
        sha,
        activeTournaments,
        archiveResult.archivedTournaments,
        archiveResult.archiveError
      );

      return new Response(html, {
        headers: { "content-type": "text/html;charset=utf-8" }
      });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}
