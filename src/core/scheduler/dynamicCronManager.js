import { FandomClient } from "../../api/fandomClient.js";
import {
  IDLE_SWEEP_CRON,
  buildActiveBucketCronsFromState,
  collectSchedulesFromState,
  shouldRunPlayLeagueAt
} from "./cronBuckets.js";
import { updateSchedules } from "./cloudflareSchedules.js";
import {
  buildPlayWindow,
  buildWindowFromMeta,
  fetchTodayMatchesUtc,
  fetchTournamentMetasFromHome,
  loginFandom
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
import { formatUtcDate } from "./scheduleTime.js";

export { buildActiveBucketCronsFromState };

async function writeStateAndSchedules(env, state, nowUtc, reason) {
  const schedules = collectSchedulesFromState(state, nowUtc);
  await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, false));
  await updateSchedules(env, schedules);
  await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, true));
  console.log(`[CRON-${reason}] date=${state.date} schedules=${schedules.join(",")}`);
}

async function ensureSchedulesApplied(env, state, nowUtc) {
  const schedules = collectSchedulesFromState(state, nowUtc);
  if (JSON.stringify(state.schedules || []) === JSON.stringify(schedules) && state.schedulesAppliedAt) return false;
  await updateSchedules(env, schedules);
  await writeControl(env, attachSchedulePlan(state, schedules, nowUtc, true));
  console.log(`[CRON-REAPPLY] date=${state.date} schedules=${schedules.join(",")}`);
  return true;
}

export async function planTodayPlay(env, tournaments, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const auth = await loginFandom(env);
  const fandomClient = new FandomClient(auth);
  const matchesBySlug = await fetchTodayMatchesUtc(tournaments, fandomClient, now);
  const metas = await fetchTournamentMetasFromHome(env, tournaments);
  const metasBySlug = new Map(metas.map(meta => [meta.slug, meta]));
  const next = buildIdleState(today, tournaments);

  for (const tournament of tournaments || []) {
    const slug = tournament?.slug;
    const window = buildPlayWindow(matchesBySlug.get(slug) || [], metasBySlug.get(slug) || {});
    if (!window) continue;
    const candidate = buildLeagueState("idle", window);
    candidate.phase = derivePhase(candidate, metasBySlug.get(slug) || {}, now);
    next.leagues[slug] = candidate;
  }

  await writeStateAndSchedules(env, next, now, "PLAN");
}

export async function ensureDayInitialized(env, tournaments, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (state?.date === today) {
    const aligned = alignStateLeaguesWithTournaments(state, tournaments);
    const metas = await fetchTournamentMetasFromHome(env, tournaments);
    const metasBySlug = new Map(metas.map(meta => [meta.slug, meta]));
    const phaseChanged = syncPhaseByWindowAndMeta(state, metasBySlug, now);
    if (aligned) {
      await writeStateAndSchedules(env, state, now, "ALIGN");
      return false;
    }
    if (phaseChanged.length > 0) {
      await writeControl(env, state);
      console.log(`[CRON-PHASE] date=${today} ${phaseChanged.join(",")}`);
    }
    await ensureSchedulesApplied(env, state, now);
    return false;
  }
  await planTodayPlay(env, tournaments, scheduledTimeMs);
  return true;
}

export async function resolveScheduledExecutionSlugs(env, scheduledTimeMs, eventCron) {
  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return new Set();

  if (eventCron === IDLE_SWEEP_CRON) {
    return new Set(Object.entries(state.leagues)
      .filter(([slug, leagueState]) => {
        assertLeagueState(slug, leagueState);
        return leagueState.phase === "idle";
      })
      .map(([slug]) => slug));
  }

  const activeCrons = new Set(buildActiveBucketCronsFromState(state, now));
  if (!activeCrons.has(eventCron)) return new Set();

  const slugs = new Set();
  for (const [slug, leagueState] of Object.entries(state.leagues)) {
    assertLeagueState(slug, leagueState);
    if (shouldRunPlayLeagueAt(leagueState, now)) slugs.add(slug);
  }
  return slugs;
}

export async function reconcileLeagueStates(env, tournaments, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return;

  const metas = await fetchTournamentMetasFromHome(env, tournaments);
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
  await writeStateAndSchedules(env, state, now, "RECONCILE");
  const details = changed.length > 0 ? changed.join(",") : "aligned-only";
  console.log(`[CRON-STATE] date=${today} ${details}`);
}
