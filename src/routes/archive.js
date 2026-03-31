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
}
