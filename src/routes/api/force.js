import { ensureDayInitialized, reconcileLeagueStates } from "../../core/scheduler/dynamicCronManager.js";
import { Updater } from "../../core/updater.js";
import { requireAdmin } from "./auth.js";

function parseForceSlugs(body) {
  if (!body || !Array.isArray(body.slugs)) return null;
  const cleanSlugs = body.slugs
    .filter(slug => typeof slug === "string")
    .map(slug => slug.trim())
    .filter(Boolean);
  return cleanSlugs.length > 0 ? new Set(cleanSlugs) : null;
}

export async function handleForceUpdate(request, env) {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  try {
    let forceSlugs = null;
    try {
      forceSlugs = parseForceSlugs(await request.json());
      if (!forceSlugs) return new Response("Missing required field: slugs[]", { status: 400 });
    } catch (_error) {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    const updater = new Updater(env);
    let runtimeConfig;
    try {
      runtimeConfig = await updater.loadRuntimeConfig();
    } catch (_error) {
      return new Response("Config load failed", { status: 500 });
    }

    const now = Date.now();
    await updater.refreshScheduleBoardOnDayRollover(runtimeConfig);
    await ensureDayInitialized(env, runtimeConfig, now, { applySchedules: "best-effort" });

    const cache = await updater.loadCachedData(runtimeConfig.TOURNAMENTS);
    await updater.runFandomUpdate(runtimeConfig, cache, true, forceSlugs);
    await reconcileLeagueStates(env, runtimeConfig, now, { applySchedules: "best-effort" });

    return new Response("OK", { status: 200 });
  } catch (error) {
    return new Response(`Worker Error: ${error.message}`, { status: 500 });
  }
}
