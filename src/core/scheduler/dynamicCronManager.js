import {
  buildActiveBucketCronsFromState,
  collectSchedulesFromState,
  shouldRunPlayLeagueAt
} from "./cronBuckets.js";
import { updateSchedules } from "./cloudflareSchedules.js";
import {
  buildWindowFromMeta,
  fetchTournamentMetasFromScheduleMeta
} from "./scheduleDiscovery.js";
import {
  alignStateLeaguesWithTournaments,
  assertLeagueState,
  attachSchedulePlan,
  buildIdleState,
  buildLeagueState,
  derivePhase,
  hasPlayWindow,
  readControl,
  syncPhaseByWindowAndMeta,
  writeControl
} from "./scheduleState.js";
import { timePolicy } from "../../utils/timePolicy.js";

export { buildActiveBucketCronsFromState };

async function writeStateAndSchedules(env, state, nowUtc, reason, options = {}) {
  const schedules = collectSchedulesFromState(state, nowUtc);
  await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, false));
  if (options.applySchedules === false) {
    console.log(`[SCHED:${reason}] date=${state.date} schedules=${schedules.join(",")} apply=skip`);
    return;
  }
  try {
    await updateSchedules(env, schedules);
  } catch (error) {
    if (options.applySchedules === "best-effort") {
      console.warn(`[SCHED:${reason}] schedule apply failed: ${error.message}`);
      return;
    }
    throw error;
  }
  await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, true));
  console.log(`[SCHED:${reason}] date=${state.date} schedules=${schedules.join(",")}`);
}

async function ensureSchedulesApplied(env, state, nowUtc, options = {}) {
  const schedules = collectSchedulesFromState(state, nowUtc);
  if (JSON.stringify(state.schedules || []) === JSON.stringify(schedules) && state.schedulesAppliedAt) return false;
  if (options.applySchedules === false) {
    await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, false));
    console.log(`[SCHED:REAPPLY] date=${state.date} schedules=${schedules.join(",")} apply=skip`);
    return true;
  }
  try {
    await updateSchedules(env, schedules);
  } catch (error) {
    if (options.applySchedules === "best-effort") {
      await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, false));
      console.warn(`[SCHED:REAPPLY] schedule apply failed: ${error.message}`);
      return true;
    }
    throw error;
  }
  await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, true));
  console.log(`[SCHED:REAPPLY] date=${state.date} schedules=${schedules.join(",")}`);
  return true;
}

export async function planTodayPlay(env, tournaments, scheduledTimeMs, options = {}) {
  const now = new Date(scheduledTimeMs);
  const today = timePolicy.getBusinessDateKey(now);
  const metas = await fetchTournamentMetasFromScheduleMeta(env, tournaments);
  const metasBySlug = new Map(metas.map(meta => [meta.slug, meta]));
  const next = buildIdleState(today, tournaments);

  for (const tournament of tournaments || []) {
    const slug = tournament?.slug;
    const window = buildWindowFromMeta(metasBySlug.get(slug) || {});
    if (!window) continue;
    const candidate = buildLeagueState("idle", window);
    candidate.phase = derivePhase(candidate, metasBySlug.get(slug) || {}, now);
    next.leagues[slug] = candidate;
  }

  await writeStateAndSchedules(env, next, now, "PLAN", options);
}

export async function ensureDayInitialized(env, tournaments, scheduledTimeMs, options = {}) {
  const now = new Date(scheduledTimeMs);
  const today = timePolicy.getBusinessDateKey(now);
  const state = await readControl(env);
  if (state?.date === today) {
    const aligned = alignStateLeaguesWithTournaments(state, tournaments);
    const metas = await fetchTournamentMetasFromScheduleMeta(env, tournaments);
    const metasBySlug = new Map(metas.map(meta => [meta.slug, meta]));
    const phaseChanged = syncPhaseByWindowAndMeta(state, metasBySlug, now);
    if (aligned) {
      await writeStateAndSchedules(env, state, now, "ALIGN", options);
      return false;
    }
    if (phaseChanged.length > 0) {
      await writeControl(env, state);
      console.log(`[SCHED:PHASE] date=${today} ${phaseChanged.join(",")}`);
    }
    await ensureSchedulesApplied(env, state, now, options);
    return false;
  }
  await planTodayPlay(env, tournaments, scheduledTimeMs, options);
  return true;
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
  const now = new Date(nowMs);
  const today = timePolicy.getBusinessDateKey(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return;

  const metas = await fetchTournamentMetasFromScheduleMeta(env, tournaments);
  const metasBySlug = new Map(metas.map(meta => [meta.slug, meta]));
  const aligned = alignStateLeaguesWithTournaments(state, tournaments);
  const changed = [];

  for (const tournament of tournaments || []) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    const leagueState = state.leagues[slug];
    assertLeagueState(slug, leagueState);

    const meta = metasBySlug.get(slug) || {};
    const hasUnfinished = !!meta.hasHistoryUnfinished || Number(meta.todayUnfinished) > 0;
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
