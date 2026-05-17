import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { kvPut } from "../../utils/kvStore.js";
import { timePolicy } from "../../utils/timePolicy.js";
import { assertScheduleMetaFields } from "../facts/scheduleMetaStore.js";

export async function readControl(env) {
  const kv = env["lol-stats-kv"];
  const state = await kv.get(kvKeys.scheduleDay(), { type: "json" });
  if (state == null) return null;
  if (typeof state !== "object" || Array.isArray(state)) throw new Error("SCHEDULE_DAY must be a JSON object");
  if (!state.leagues || typeof state.leagues !== "object" || Array.isArray(state.leagues)) {
    throw new Error("SCHEDULE_DAY.leagues must be a JSON object");
  }
  return state;
}

export async function writeControl(env, state) {
  await kvPut(env, kvKeys.scheduleDay(), state);
}

export function attachSchedulePlan(state, schedules) {
  state.schedules = schedules;
  return state;
}

export function buildLeagueState(phase = "idle", window = null) {
  return {
    phase,
    playStartHour: window?.startHour ?? null,
    playEndHour: window?.endHour ?? null
  };
}

export function hasPlayWindow(leagueState) {
  return leagueState.playStartHour !== null || leagueState.playEndHour !== null;
}

function assertPlayWindow(slug, leagueState) {
  const startHour = leagueState.playStartHour;
  const endHour = leagueState.playEndHour;
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    throw new Error(`SCHEDULE_DAY.leagues.${slug} play window missing`);
  }
  if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
    throw new Error(`SCHEDULE_DAY.leagues.${slug} play window out of range: ${startHour}-${endHour}`);
  }
  if (startHour > endHour) {
    throw new Error(`SCHEDULE_DAY.leagues.${slug} play window invalid: ${startHour}-${endHour}`);
  }
}

export function isNowInPlayWindow(leagueState, nowUtc) {
  const hour = timePolicy.getBusinessHour(nowUtc);
  return hour >= leagueState.playStartHour && hour <= leagueState.playEndHour;
}

export function derivePhase(leagueState, meta, nowUtc) {
  if (!hasPlayWindow(leagueState)) return "idle";
  const fields = assertScheduleMetaFields("SCHEDULE_META", meta);
  const hasUnfinished = fields.hasHistoryUnfinished || fields.todayUnfinished > 0;
  return hasUnfinished && isNowInPlayWindow(leagueState, nowUtc) ? "play" : "idle";
}

export function syncPhaseByWindowAndMeta(state, metasBySlug, nowUtc) {
  const changed = [];
  for (const [slug, leagueState] of Object.entries(state.leagues)) {
    assertLeagueState(slug, leagueState);
    const meta = metasBySlug.get(slug);
    if (!meta) throw new Error(`SCHEDULE_META missing after load: ${slug}`);
    const nextPhase = derivePhase(leagueState, meta, nowUtc);
    if (leagueState.phase === nextPhase) continue;
    changed.push(`${slug}:${leagueState.phase}->${nextPhase}`);
    leagueState.phase = nextPhase;
  }
  return changed;
}

export function buildIdleState(today, tournaments) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  const leagues = {};
  for (const tournament of tournaments) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    leagues[slug] = buildLeagueState();
  }
  return { date: today, leagues };
}

export function assertLeagueState(slug, leagueState) {
  if (!leagueState || typeof leagueState !== "object" || Array.isArray(leagueState)) {
    throw new Error(`SCHEDULE_DAY.leagues.${slug} must be a JSON object`);
  }
  if (!["idle", "play"].includes(leagueState.phase)) {
    throw new Error(`Invalid scheduler phase for ${slug}: ${leagueState.phase}`);
  }
  if (leagueState.playStartHour === null && leagueState.playEndHour === null) {
    if (leagueState.phase === "play") {
      throw new Error(`SCHEDULE_DAY.leagues.${slug} play phase requires a window`);
    }
    return;
  }
  if (leagueState.playStartHour === null || leagueState.playEndHour === null) {
    throw new Error(`SCHEDULE_DAY.leagues.${slug} play window incomplete`);
  }
  assertPlayWindow(slug, leagueState);
}

export function alignStateLeaguesWithTournaments(state, tournaments) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  const expectedSlugs = new Set();
  for (const tournament of tournaments) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    expectedSlugs.add(slug);
  }

  let changed = false;
  for (const slug of expectedSlugs) {
    if (!Object.prototype.hasOwnProperty.call(state.leagues, slug)) {
      state.leagues[slug] = buildLeagueState();
      changed = true;
    }
  }

  for (const existingSlug of Object.keys(state.leagues)) {
    if (expectedSlugs.has(existingSlug)) continue;
    delete state.leagues[existingSlug];
    changed = true;
  }

  return changed;
}
