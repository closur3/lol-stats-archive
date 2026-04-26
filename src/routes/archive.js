import { kvKeys } from '../infrastructure/kv/keyFactory.js';

/**
 * 归档路由处理
 */
export class ArchiveRouter {
  static htmlHeaders() {
    return {
      "content-type": "text/html;charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache",
      expires: "0"
    };
  }

  /**
   * 处理归档页面请求
   */
  static async handleArchive(request, env) {
    const html = await env["lol-stats-kv"].get(kvKeys.archiveStatic());
    if (html) {
      return new Response(html, { headers: ArchiveRouter.htmlHeaders() });
    }
    
    return new Response(
      "Archive initializing... Please <a href='/tools'>run a Local UI Refresh</a> or wait for the next background update.", 
      { headers: ArchiveRouter.htmlHeaders() }
    );
  }
}
