import {
  buildWindowFromMeta,
  fetchTournamentMetasFromScheduleMeta
} from "./scheduleDiscovery.js";
import {
  alignStateLeaguesWithTournaments,
  assertLeagueState,
  buildIdleState,
  buildLeagueState,
  derivePhase,
  hasPlayWindow,
  readControl,
  syncPhaseByWindowAndMeta,
  writeControl
} from "./scheduleState.js";
import { ensureSchedulesApplied, writeStateAndSchedules } from "./scheduleWriter.js";
import { timePolicy } from "../../utils/timePolicy.js";
import { rebuildScheduleMetaFromRawMatches } from "../facts/scheduleMetaStore.js";
import { cleanupStaleHomeKeys } from "../updater/cleanup.js";

function requireMeta(metasBySlug, slug) {
  const meta = metasBySlug.get(slug);
  if (!meta) throw new Error(`SCHEDULE_META missing after load: ${slug}`);
  return meta;
}

function hasUnfinishedMatches(meta) {
  return meta.hasHistoryUnfinished || meta.todayUnfinished > 0;
}

function requirePlayWindow(slug, meta) {
  const window = buildWindowFromMeta(meta);
  if (!window) throw new Error(`Cannot restore play window for ${slug}`);
  return window;
}

export async function planTodayPlay(env, tournaments, scheduledTimeMs, options = {}) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  const now = new Date(scheduledTimeMs);
  const today = timePolicy.getBusinessDateKey(now);
  const metas = await fetchTournamentMetasFromScheduleMeta(env, tournaments);
  const metasBySlug = new Map(metas.map(meta => [meta.slug, meta]));
  const next = buildIdleState(today, tournaments);

  for (const tournament of tournaments) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    const meta = requireMeta(metasBySlug, slug);
    if (!hasUnfinishedMatches(meta)) continue;
    const window = requirePlayWindow(slug, meta);
    const candidate = buildLeagueState("idle", window);
    candidate.phase = derivePhase(candidate, meta, now);
    next.leagues[slug] = candidate;
  }

  await writeStateAndSchedules(env, next, now, "PLAN", options);
}

export async function ensureDayInitialized(env, tournaments, scheduledTimeMs, options = {}) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  const now = new Date(scheduledTimeMs);
  const today = timePolicy.getBusinessDateKey(now);
  const state = await readControl(env);
  if (state?.date !== today) {
    await planTodayPlay(env, tournaments, scheduledTimeMs, options);
    return true;
  }

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
    const hasUnfinished = hasUnfinishedMatches(meta);
    let nextLeagueState = leagueState;

    if (!hasUnfinished) {
      nextLeagueState = buildLeagueState("idle");
    } else if (!hasPlayWindow(leagueState)) {
      nextLeagueState = buildLeagueState("idle", requirePlayWindow(slug, meta));
    }

    nextLeagueState.phase = derivePhase(nextLeagueState, meta, now);
    if (JSON.stringify(leagueState) !== JSON.stringify(nextLeagueState)) {
      state.leagues[slug] = nextLeagueState;
      changed.push(`${slug}:${leagueState.phase}->${nextLeagueState.phase}`);
    }
  }

  if (!aligned && changed.length === 0) {
    await ensureSchedulesApplied(env, state, now, options);
    return;
  }
  await writeStateAndSchedules(env, state, now, "RECONCILE", options);
  const details = changed.length > 0 ? changed.join(",") : "aligned-only";
  console.log(`[SCHED:STATE] date=${today} ${details}`);
}

export async function runScheduleMaintenance(env, tournaments, scheduledTimeMs, options = {}) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  const now = new Date(scheduledTimeMs);
  const today = timePolicy.getBusinessDateKey(now);

  const state = await readControl(env);
  const lastDay = state?.date || null;

  if (lastDay !== today) {
    const rebuiltMetas = await Promise.all(
      tournaments.map(async (tournament) => {
        const slug = tournament?.slug;
        if (!slug) throw new Error("Tournament slug missing");
        return rebuildScheduleMetaFromRawMatches(env, slug);
      })
    );
    await cleanupStaleHomeKeys(env, tournaments);
    console.log(`[SCHED:DAY] ${lastDay || "none"} -> ${today}`);

    const metasBySlug = new Map(rebuiltMetas.map(meta => [meta.slug, meta]));
    const next = buildIdleState(today, tournaments);

    for (const tournament of tournaments) {
      const slug = tournament?.slug;
      if (!slug) throw new Error("Tournament slug missing");
      const meta = metasBySlug.get(slug);
      if (!meta) throw new Error(`SCHEDULE_META missing after load: ${slug}`);

      const hasUnfinished = hasUnfinishedMatches(meta);
      if (hasUnfinished) {
        const candidate = buildLeagueState("idle", requirePlayWindow(slug, meta));
        candidate.phase = derivePhase(candidate, meta, now);
        next.leagues[slug] = candidate;
      }
    }

    await writeStateAndSchedules(env, next, now, "PLAN", options);
    return;
  }

  const alignmentChanged = alignStateLeaguesWithTournaments(state, tournaments);
  const metas = await fetchTournamentMetasFromScheduleMeta(env, tournaments);
  const metasBySlug = new Map(metas.map(meta => [meta.slug, meta]));

  const reconciled = [];
  for (const tournament of tournaments) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    const leagueState = state.leagues[slug];
    assertLeagueState(slug, leagueState);

    const meta = metasBySlug.get(slug);
    if (!meta) throw new Error(`SCHEDULE_META missing after load: ${slug}`);
    const hasUnfinished = hasUnfinishedMatches(meta);

    let nextLeagueState = leagueState;

    if (!hasUnfinished) {
      nextLeagueState = buildLeagueState("idle");
    } else {
      if (!hasPlayWindow(leagueState)) {
        nextLeagueState = buildLeagueState("idle", requirePlayWindow(slug, meta));
      }
      nextLeagueState.phase = derivePhase(nextLeagueState, meta, now);
    }

    if (JSON.stringify(leagueState) !== JSON.stringify(nextLeagueState)) {
      state.leagues[slug] = nextLeagueState;
      reconciled.push(`${slug}:${leagueState.phase}->${nextLeagueState.phase}`);
    }
  }

  const hasChanges = alignmentChanged || reconciled.length > 0;
  if (!hasChanges) {
    await ensureSchedulesApplied(env, state, now, options);
    return;
  }

  if (reconciled.length > 0) {
    console.log(`[SCHED:STATE] date=${today} ${reconciled.join(",")}`);
  }

  await writeStateAndSchedules(env, state, now, "RECONCILE", options);
}
