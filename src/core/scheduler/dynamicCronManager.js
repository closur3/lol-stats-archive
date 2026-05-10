import { FandomClient } from "../../api/fandomClient.js";
import { dataUtils } from "../../utils/dataUtils.js";
import { kvKeys } from "../../infrastructure/kv/keyFactory.js";

const IDLE_SWEEP_CRON = "0 */2 * * *";
const WORKER_NAME = "lol-stats";
const WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MAX_ACTIVE_CRONS = 4;
const MAX_TOTAL_CRONS = 5;

function formatUtcDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseUtcDateTime(raw) {
  const dt = new Date(raw.replace(" ", "T") + "Z");
  if (Number.isNaN(dt.getTime())) throw new Error(`Invalid DateTimeUTC: ${raw}`);
  return dt;
}

function toActiveCron(startHour, endHour, nowUtc) {
  const day = WEEKDAY[nowUtc.getUTCDay()];
  return `1-59/2 ${startHour}-${endHour} * * ${day}`;
}

async function loginFandom(env) {
  return FandomClient.login(env.FANDOM_BOT_USERNAME, env.FANDOM_BOT_PASSWORD);
}

async function fetchTodayMatchesUtc(tournaments, fandomClient, targetDateUtc) {
  const dateStr = formatUtcDate(targetDateUtc);
  const bySlug = new Map();
  for (const tournament of tournaments || []) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    const pages = dataUtils.normalizeOverviewPages(tournament.overview_page);
    if (!pages.length) throw new Error(`overview_page missing: ${slug}`);
    const matches = await fandomClient.fetchAllMatches(slug, pages, { start: dateStr, end: dateStr });
    bySlug.set(slug, matches);
  }
  return bySlug;
}

async function fetchTournamentMetasFromHome(env, tournaments) {
  const kv = env["lol-stats-kv"];
  const entries = await Promise.all((tournaments || []).map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    const home = await kv.get(kvKeys.home(slug), { type: "json" });
    const meta = home?.tournament || {};
    return {
      slug,
      todayEarliestTimestamp: Number(meta.todayEarliestTimestamp) || 0,
      todayUnfinished: Number(meta.todayUnfinished) || 0,
      hasHistoryUnfinished: !!meta.hasHistoryUnfinished
    };
  }));
  return entries;
}

function buildPlayWindow(matches, meta) {
  let earliest = null;
  for (const match of matches || []) {
    const raw = match?.DateTimeUTC;
    if (!raw) continue;
    const dt = parseUtcDateTime(raw);
    if (!earliest || dt < earliest) earliest = dt;
  }

  const metaEarliest = Number(meta?.todayEarliestTimestamp) || 0;
  if (!earliest && metaEarliest > 0) earliest = new Date(metaEarliest);

  const hasCarryoverUnfinished = !!meta?.hasHistoryUnfinished;
  if (!earliest && !hasCarryoverUnfinished) return null;

  return {
    startHour: hasCarryoverUnfinished ? 0 : earliest.getUTCHours(),
    endHour: 23
  };
}

function buildWindowFromMeta(meta) {
  const hasCarryoverUnfinished = !!meta?.hasHistoryUnfinished;
  const earliest = Number(meta?.todayEarliestTimestamp) || 0;
  if (!hasCarryoverUnfinished && !earliest) return null;
  return {
    startHour: hasCarryoverUnfinished ? 0 : new Date(earliest).getUTCHours(),
    endHour: 23
  };
}

async function readControl(env) {
  const kv = env["lol-stats-kv"];
  const state = await kv.get(kvKeys.scheduleDay(), { type: "json" });
  if (state == null) return null;
  if (typeof state !== "object" || Array.isArray(state)) throw new Error("SCHEDULE_DAY must be a JSON object");
  if (!state.leagues || typeof state.leagues !== "object" || Array.isArray(state.leagues)) {
    throw new Error("SCHEDULE_DAY.leagues must be a JSON object");
  }
  return state;
}

async function writeControl(env, state) {
  const kv = env["lol-stats-kv"];
  await kv.put(kvKeys.scheduleDay(), JSON.stringify(state));
}

function attachSchedulePlan(state, schedules, nowUtc, applied) {
  state.schedules = schedules;
  state.schedulesPlannedAt = nowUtc.toISOString();
  if (applied) state.schedulesAppliedAt = nowUtc.toISOString();
  else delete state.schedulesAppliedAt;
  return state;
}

function buildLeagueState(phase = "idle", window = null) {
  return {
    phase,
    playStartHour: window?.startHour ?? null,
    playEndHour: window?.endHour ?? null
  };
}

function buildIdleState(today, tournaments) {
  const leagues = {};
  for (const tournament of tournaments || []) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    leagues[slug] = buildLeagueState();
  }
  return { date: today, leagues };
}

function assertLeagueState(slug, leagueState) {
  if (!leagueState || typeof leagueState !== "object" || Array.isArray(leagueState)) {
    throw new Error(`SCHEDULE_DAY.leagues.${slug} must be a JSON object`);
  }
  if (!["idle", "play"].includes(leagueState.phase)) {
    throw new Error(`Invalid scheduler phase for ${slug}: ${leagueState.phase}`);
  }
  if (leagueState.phase === "play") {
    if (!Number.isInteger(Number(leagueState.playStartHour)) || !Number.isInteger(Number(leagueState.playEndHour))) {
      throw new Error(`SCHEDULE_DAY.leagues.${slug} play window missing`);
    }
  }
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);
  const merged = [];

  for (const interval of sorted) {
    const last = merged.at(-1);
    if (!last || interval.startHour > last.endHour) {
      merged.push({ startHour: interval.startHour, endHour: interval.endHour });
      continue;
    }
    last.endHour = Math.max(last.endHour, interval.endHour);
  }

  while (merged.length > MAX_ACTIVE_CRONS) {
    let mergeIndex = 0;
    let bestGap = Infinity;
    for (let index = 0; index < merged.length - 1; index++) {
      const gap = merged[index + 1].startHour - merged[index].endHour - 1;
      if (gap < bestGap) {
        bestGap = gap;
        mergeIndex = index;
      }
    }
    merged.splice(mergeIndex, 2, {
      startHour: merged[mergeIndex].startHour,
      endHour: Math.max(merged[mergeIndex].endHour, merged[mergeIndex + 1].endHour)
    });
  }

  return merged;
}

export function buildActiveBucketCronsFromState(state, nowUtc) {
  const intervals = [];
  for (const [slug, leagueState] of Object.entries(state.leagues || {})) {
    assertLeagueState(slug, leagueState);
    if (leagueState.phase !== "play") continue;
    intervals.push({
      startHour: Number(leagueState.playStartHour),
      endHour: Number(leagueState.playEndHour)
    });
  }

  const buckets = mergeIntervals(intervals);
  return buckets.map(bucket => toActiveCron(bucket.startHour, bucket.endHour, nowUtc));
}

function collectSchedulesFromState(state, nowUtc) {
  const activeCrons = buildActiveBucketCronsFromState(state, nowUtc);
  const schedules = Array.from(new Set([IDLE_SWEEP_CRON, ...activeCrons]));
  if (schedules.length > MAX_TOTAL_CRONS) {
    throw new Error(`Cloudflare cron limit exceeded: ${schedules.length}/${MAX_TOTAL_CRONS}`);
  }
  return schedules;
}

function shouldRunPlayLeagueAt(leagueState, nowUtc) {
  if (leagueState.phase !== "play") return false;
  const hour = nowUtc.getUTCHours();
  return hour >= Number(leagueState.playStartHour) && hour <= Number(leagueState.playEndHour);
}

async function updateSchedules(env, schedules) {
  if (env.DISABLE_CLOUDFLARE_CRON_UPDATE === "1") {
    console.log(`[CRON-SKIP] disable schedule update, schedules=${JSON.stringify(schedules)}`);
    return;
  }
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error("Missing Cloudflare schedule env: CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${WORKER_NAME}/schedules`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(schedules.map(cron => ({ cron })))
  });
  if (!response.ok) throw new Error(`Cloudflare schedules HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  if (!payload?.success) throw new Error(`Cloudflare schedules failed: ${JSON.stringify(payload)}`);
}

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
    next.leagues[slug] = buildLeagueState("play", window);
  }

  await writeStateAndSchedules(env, next, now, "PLAN");
}

export async function ensureDayInitialized(env, tournaments, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (state?.date === today) {
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
  const changed = [];

  for (const tournament of tournaments || []) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    const leagueState = state.leagues[slug];
    assertLeagueState(slug, leagueState);

    const meta = metasBySlug.get(slug) || {};
    const hasUnfinished = !!meta.hasHistoryUnfinished || Number(meta.todayUnfinished) > 0;

    if (leagueState.phase === "play" && !hasUnfinished) {
      state.leagues[slug] = buildLeagueState("idle");
      changed.push(`${slug}:play->idle`);
      continue;
    }

    if (leagueState.phase === "idle" && hasUnfinished) {
      const window = buildWindowFromMeta(meta);
      if (!window) throw new Error(`Cannot restore play window for ${slug}`);
      state.leagues[slug] = buildLeagueState("play", window);
      changed.push(`${slug}:idle->play`);
    }
  }

  if (changed.length === 0) return;
  await writeStateAndSchedules(env, state, now, "RECONCILE");
  console.log(`[CRON-STATE] date=${today} ${changed.join(",")}`);
}
