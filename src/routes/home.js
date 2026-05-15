import { renderCache } from '../cache/renderCache.js';
import { renderHomeFromFacts } from '../render/ssrRenderService.js';

export class HomeRouter {
  static async handleHome(request, env) {
    const cached = renderCache.getHome();
    if (cached) {
      return new Response(cached, {
        headers: { "content-type": "text/html;charset=utf-8" }
      });
    }

    const html = await renderHomeFromFacts(env);
    renderCache.setHome(html);
    return new Response(html, {
      headers: { "content-type": "text/html;charset=utf-8" }
    });
  }
}
