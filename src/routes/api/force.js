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
    } catch (error) {
      return new Response(`Config load failed: ${error.message}`, { status: 500 });
    }

    const now = Date.now();
    const tournaments = runtimeConfig.TOURNAMENTS;
    const cache = await updater.loadCachedData(tournaments);
    await updater.runFandomUpdate(runtimeConfig, cache, true, forceSlugs);

    const warnings = [];
    try {
      await updater.refreshScheduleBoardOnDayRollover(runtimeConfig);
    } catch (error) {
      warnings.push(`day-rollover: ${error.message}`);
      console.warn(`[API:FORCE] day-rollover failed: ${error.message}`);
    }

    try {
      await ensureDayInitialized(env, tournaments, now, { applySchedules: "best-effort" });
      await reconcileLeagueStates(env, tournaments, now, { applySchedules: "best-effort" });
    } catch (error) {
      warnings.push(`schedule-reconcile: ${error.message}`);
      console.warn(`[API:FORCE] schedule reconcile failed: ${error.message}`);
    }

    const message = warnings.length > 0 ? `OK warnings=${warnings.join(" | ")}` : "OK";
    return new Response(message, { status: 200 });
  } catch (error) {
    return new Response(`Worker Error: ${error.message}`, { status: 500 });
  }
}
