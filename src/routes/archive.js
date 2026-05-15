import { renderCache } from '../cache/renderCache.js';
import { renderArchiveFromFacts } from '../render/ssrRenderService.js';

export class ArchiveRouter {
  static htmlHeaders() {
    return {
      "content-type": "text/html;charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache",
      expires: "0"
    };
  }

  static async handleArchive(request, env) {
    const cached = renderCache.getArchive();
    if (cached) {
      return new Response(cached, { headers: ArchiveRouter.htmlHeaders() });
    }

    const html = await renderArchiveFromFacts(env);

    renderCache.setArchive(html);
    return new Response(html, { headers: ArchiveRouter.htmlHeaders() });
  }
}
