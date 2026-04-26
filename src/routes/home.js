import { kvKeys } from '../infrastructure/kv/keyFactory.js';

/**
 * 首页路由处理
 */
export class HomeRouter {
  /**
   * 处理首页请求
   */
  static async handleHome(request, env) {
    const kvStore = env?.["lol-stats-kv"];
    if (!kvStore || typeof kvStore.get !== "function") {
      return new Response(
        "KV binding missing: expected `lol-stats-kv`. Check wrangler.toml and Cloudflare Worker bindings.",
        { status: 500, headers: { "content-type": "text/plain;charset=utf-8" } }
      );
    }

    const html = await kvStore.get(kvKeys.homeStatic());
    if (html) {
      return new Response(html, { 
        headers: { "content-type": "text/html;charset=utf-8" } 
      });
    }
    
    return new Response(
      "Initializing... Please wait for the first background update or <a href='/tools'>run a Refresh API</a>.", 
      { headers: { "content-type": "text/html;charset=utf-8" } }
    );
  }
}
