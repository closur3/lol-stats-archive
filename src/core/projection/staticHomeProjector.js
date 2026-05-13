import { HTMLRenderer } from "../../render/htmlRenderer.js";
import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { kvPutIfChanged } from "../../utils/kvStore.js";

export async function writeStaticHomeProjection(env, runtimeConfig, analysis) {
  const tournamentMeta = {};
  for (const [slug, meta] of Object.entries(analysis.tournamentMeta || {})) {
    tournamentMeta[slug] = { ...(meta || {}) };
  }

  const homeFragment = HTMLRenderer.renderContentOnly(
    analysis.globalStats,
    analysis.timeGrid,
    analysis.scheduleMap,
    runtimeConfig,
    false,
    tournamentMeta
  );
  const fullPage = HTMLRenderer.renderPageShell("LoL Stats", homeFragment, "home", env.GITHUB_TIME, env.GITHUB_SHA);
  await kvPutIfChanged(env, kvKeys.homeStatic(), fullPage);
}
