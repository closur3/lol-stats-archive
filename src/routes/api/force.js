import { ensureDayInitialized, reconcileLeagueStates } from "../../core/scheduler/dynamicCronManager.js";
import { GitHubClient } from "../../api/githubClient.js";
import { Logger } from "../../infrastructure/logger.js";
import { loadRuntimeConfig } from "../../core/updater/configLoader.js";
import { loadPreviousCachedData } from "../../core/updater/cache.js";
import { runFandomUpdate } from "../../core/updater/fandomSync.js";
import { refreshScheduleBoardOnDayRollover } from "../../core/updater/dayRollover.js";
import { detectRevisionChanges } from "../../core/updater/revisionDetector.js";
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

    const githubClient = new GitHubClient(env);
    const logger = new Logger();
    let runtimeConfig;
    try {
      runtimeConfig = await loadRuntimeConfig(env, githubClient);
    } catch (error) {
      return new Response(`Config load failed: ${error.message}`, { status: 500 });
    }

    const now = Date.now();
    const tournaments = runtimeConfig.TOURNAMENTS;
    const forcedTournaments = tournaments.filter(tournament => forceSlugs.has(tournament.slug));
    if (forcedTournaments.length !== forceSlugs.size) return new Response("Unknown slug in slugs[]", { status: 400 });
    const cache = await loadPreviousCachedData(env, forcedTournaments);
    const { revidChanges, pendingRevisionWrites } = await detectRevisionChanges(env, forcedTournaments);
    await runFandomUpdate(env, githubClient, runtimeConfig, cache, true, forceSlugs, {
      forceWrite: true,
      revidChanges,
      pendingRevisionWrites
    }, logger);

    await refreshScheduleBoardOnDayRollover(env, runtimeConfig, now);

    const scheduleWarnings = [];
    const scheduleOptions = { applySchedules: "best-effort", scheduleWarnings };
    await ensureDayInitialized(env, tournaments, now, scheduleOptions);
    await reconcileLeagueStates(env, tournaments, now, scheduleOptions);
    if (scheduleWarnings.length > 0) {
      return new Response(`PARTIAL scheduleWarnings=${scheduleWarnings.join(" | ")}`, { status: 207 });
    }
    return new Response("OK", { status: 200 });
  } catch (error) {
    return new Response(`Worker Error: ${error.message}`, { status: 500 });
  }
}
