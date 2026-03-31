import { HTMLRenderer } from '../render/htmlRenderer.js';
import { KV_KEYS } from '../utils/constants.js';

/**
 * 首页路由处理
 */
export class HomeRouter {
  static htmlHeaders() {
    return {
      "content-type": "text/html;charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache",
      expires: "0"
    };
  }

  /**
   * 处理首页请求
   */
  static async handleHome(request, env) {
    const html = await env.LOL_KV.get(KV_KEYS.HOME_STATIC_HTML);
    if (html) {
      return new Response(html, { headers: HomeRouter.htmlHeaders() });
    }
    
    return new Response(
      "Initializing... Please wait for the first background update or <a href='/tools'>run a Refresh API</a>.", 
      { headers: HomeRouter.htmlHeaders() }
    );
  }
}
