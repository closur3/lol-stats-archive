import { buildActiveBucketCronsFromState, shouldRunPlayLeagueAt } from "./cronBuckets.js";
import {
  buildWindowFromMeta,
  fetchTournamentMetasFromScheduleMeta
} from "./scheduleDiscovery.js";
import {
  alignStateLeaguesWithTournaments,
  assertLeagueState,
  buildLeagueState,
  derivePhase,
  hasPlayWindow,
  readControl
} from "./scheduleState.js";
import { writeStateAndSchedules } from "./scheduleWriter.js";
import { timePolicy } from "../../utils/timePolicy.js";

function requireMeta(metasBySlug, slug) {
  const meta = metasBySlug.get(slug);
  if (!meta) throw new Error(`SCHEDULE_META missing after load: ${slug}`);
  return meta;
}

export async function resolveScheduledExecutionSlugs(env, scheduledTimeMs, eventCron) {
  const now = new Date(scheduledTimeMs);
  const today = timePolicy.getBusinessDateKey(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return null;

  const activeCrons = new Set(buildActiveBucketCronsFromState(state, now));
  if (!activeCrons.has(eventCron)) return null;

  const slugs = new Set();
  for (const [slug, leagueState] of Object.entries(state.leagues)) {
    assertLeagueState(slug, leagueState);
    if (shouldRunPlayLeagueAt(leagueState, now)) slugs.add(slug);
  }
  return slugs;
}

export async function reconcileLeagueStates(env, tournaments, nowMs = Date.now(), options = {}) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  const now = new Date(nowMs);
  const today = timePolicy.getBusinessDateKey(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return;

  const metas = await fetchTournamentMetasFromScheduleMeta(env, tournaments);
  const metasBySlug = new Map(metas.map(meta => [meta.slug, meta]));
  const aligned = alignStateLeaguesWithTournaments(state, tournaments);
  const changed = [];

  for (const tournament of tournaments) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    const leagueState = state.leagues[slug];
    assertLeagueState(slug, leagueState);

    const meta = requireMeta(metasBySlug, slug);
    const hasUnfinished = meta.hasHistoryUnfinished || meta.todayUnfinished > 0;
    let nextLeagueState = leagueState;

    if (!hasUnfinished) {
      nextLeagueState = buildLeagueState("idle");
    } else if (!hasPlayWindow(leagueState)) {
      const window = buildWindowFromMeta(meta);
      if (!window) throw new Error(`Cannot restore play window for ${slug}`);
      nextLeagueState = buildLeagueState("idle", window);
    }

    nextLeagueState.phase = derivePhase(nextLeagueState, meta, now);
    if (JSON.stringify(leagueState) !== JSON.stringify(nextLeagueState)) {
      state.leagues[slug] = nextLeagueState;
      changed.push(`${slug}:${leagueState.phase}->${nextLeagueState.phase}`);
    }
  }

  if (!aligned && changed.length === 0) return;
  await writeStateAndSchedules(env, state, now, "RECONCILE", options);
  const details = changed.length > 0 ? changed.join(",") : "aligned-only";
  console.log(`[SCHED:STATE] date=${today} ${details}`);
}
