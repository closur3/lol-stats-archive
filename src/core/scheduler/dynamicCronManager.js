import { FandomClient } from "../../api/fandomClient.js";
import { dataUtils } from "../../utils/dataUtils.js";
import { kvKeys } from "../../infrastructure/kv/keyFactory.js";

const BASELINE_CRON = "0 0 * * *";
const WORKER_NAME = "lol-stats";
const WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MAX_HIGH_FREQ_CRONS = 4;

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

function toSinglePointCron(date) {
  return `${date.getUTCMinutes()} ${date.getUTCHours()} * * ${WEEKDAY[date.getUTCDay()]}`;
}

async function loginFandom(env) {
  return FandomClient.login(env.FANDOM_BOT_USERNAME, env.FANDOM_BOT_PASSWORD);
}

async function fetchTodayMatchesUtc(tournaments, fandomClient, targetDateUtc) {
  const dateStr = formatUtcDate(targetDateUtc);
  const bySlug = new Map();
  for (const tournament of tournaments) {
    const slug = tournament?.slug;
    if (!slug) continue;
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
    if (!slug) return null;
    const home = await kv.get(kvKeys.home(slug), { type: "json" });
    const meta = home?.tournament || {};
    return {
      slug,
      todayEarliestTimestamp: Number(meta.todayEarliestTimestamp) || 0,
      todayUnfinished: Number(meta.todayUnfinished) || 0,
      hasHistoryUnfinished: !!meta.hasHistoryUnfinished
    };
  }));
  return entries.filter(Boolean);
}

function buildPlayWindow(matches, meta) {
  let earliest = null;
  for (const match of matches) {
    const raw = match?.DateTimeUTC;
    if (!raw) continue;
    const dt = parseUtcDateTime(raw);
    if (!earliest || dt < earliest) earliest = dt;
  }

  const metaEarliest = Number(meta?.todayEarliestTimestamp) || 0;
  if (!earliest && metaEarliest > 0) earliest = new Date(metaEarliest);

  const hasCarryoverUnfinished = !!meta?.hasHistoryUnfinished;
  if (!earliest && !hasCarryoverUnfinished) return null;

  const startHour = hasCarryoverUnfinished ? 0 : earliest.getUTCHours();
  return { startHour, endHour: 23 };
}

function toPlayCron(startHour, nowUtc) {
  const day = WEEKDAY[nowUtc.getUTCDay()];
  return `*/2 ${startHour}-23 * * ${day}`;
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

function buildLeagueIdleState() {
  return {
    phase: "idle",
    playCron: null,
    playStartHour: null,
    playEndHour: null,
    tailCron1: null,
    tailCron2: null
  };
}

function buildIdleState(today, tournaments) {
  const leagues = {};
  for (const tournament of tournaments || []) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    leagues[slug] = buildLeagueIdleState();
  }
  return {
    date: today,
    leagues
  };
}

function assertLeagueCronState(slug, cronState) {
  if (!cronState || typeof cronState !== "object" || Array.isArray(cronState)) {
    throw new Error(`SCHEDULE_DAY.leagues.${slug} must be a JSON object`);
  }
  if (!["idle", "play", "tail"].includes(cronState.phase)) {
    throw new Error(`Invalid scheduler phase for ${slug}: ${cronState.phase}`);
  }
  if ((cronState.phase === "idle" || cronState.phase === "play") && cronState.playCron) {
    if (!Number.isInteger(Number(cronState.playStartHour)) || !Number.isInteger(Number(cronState.playEndHour))) {
      throw new Error(`SCHEDULE_DAY.leagues.${slug} play window missing`);
    }
  }
}

function collectSchedulesFromState(state) {
  const schedules = new Set([BASELINE_CRON]);
  for (const [slug, cronState] of Object.entries(state.leagues || {})) {
    assertLeagueCronState(slug, cronState);
    if ((cronState.phase === "idle" || cronState.phase === "play") && cronState.playCron) {
      schedules.add(cronState.playCron);
    }
    if (cronState.phase === "tail") {
      if (cronState.tailCron1) schedules.add(cronState.tailCron1);
      if (cronState.tailCron2) schedules.add(cronState.tailCron2);
    }
  }
  return Array.from(schedules);
}

function clusterStartHours(startHours) {
  const uniqueHours = Array.from(new Set(startHours)).sort((a, b) => a - b);
  if (uniqueHours.length <= MAX_HIGH_FREQ_CRONS) return uniqueHours;

  let clusters = uniqueHours.map(hour => ({ hours: [hour] }));
  const cost = (cluster) => {
    const anchor = cluster.hours[0];
    return cluster.hours.reduce((sum, hour) => sum + hour - anchor, 0);
  };

  while (clusters.length > MAX_HIGH_FREQ_CRONS) {
    let mergeIndex = 0;
    let bestIncrease = Infinity;
    for (let index = 0; index < clusters.length - 1; index++) {
      const merged = { hours: [...clusters[index].hours, ...clusters[index + 1].hours] };
      const increase = cost(merged) - cost(clusters[index]) - cost(clusters[index + 1]);
      if (increase < bestIncrease) {
        bestIncrease = increase;
        mergeIndex = index;
      }
    }
    clusters.splice(mergeIndex, 2, { hours: [...clusters[mergeIndex].hours, ...clusters[mergeIndex + 1].hours] });
  }

  return clusters.map(cluster => cluster.hours[0]);
}

function assignPlayCrons(state, nowUtc) {
  const startHours = [];
  for (const cronState of Object.values(state.leagues || {})) {
    const startHour = Number(cronState.playStartHour);
    if ((cronState.phase === "idle" || cronState.phase === "play") && Number.isInteger(startHour)) {
      startHours.push(startHour);
    }
  }

  const anchors = clusterStartHours(startHours);
  for (const cronState of Object.values(state.leagues || {})) {
    const startHour = Number(cronState.playStartHour);
    if (!((cronState.phase === "idle" || cronState.phase === "play") && Number.isInteger(startHour))) continue;
    const anchor = anchors.filter(hour => hour <= startHour).at(-1);
    if (!Number.isInteger(anchor)) throw new Error(`No cron anchor for start hour ${startHour}`);
    cronState.playCron = toPlayCron(anchor, nowUtc);
  }
}

function shouldRunLeagueAt(cronState, nowUtc, eventCron) {
  if (cronState.playCron !== eventCron) return false;
  const startHour = Number(cronState.playStartHour);
  const endHour = Number(cronState.playEndHour);
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) return true;
  const hour = nowUtc.getUTCHours();
  return hour >= startHour && hour <= endHour;
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

export async function planTodayPlay(env, tournaments, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  const auth = await loginFandom(env);
  const fandomClient = new FandomClient(auth);
  const matchesBySlug = await fetchTodayMatchesUtc(tournaments, fandomClient, now);
  const metas = await fetchTournamentMetasFromHome(env, tournaments);
  const metasBySlug = new Map(metas.map(meta => [meta.slug, meta]));
  const today = formatUtcDate(now);
  const next = buildIdleState(today, tournaments);
  for (const tournament of tournaments || []) {
    const slug = tournament?.slug;
    const playWindow = buildPlayWindow(matchesBySlug.get(slug) || [], metasBySlug.get(slug) || {});
    if (playWindow) {
      next.leagues[slug].playStartHour = playWindow.startHour;
      next.leagues[slug].playEndHour = playWindow.endHour;
    }
  }
  assignPlayCrons(next, now);
  await updateSchedules(env, collectSchedulesFromState(next));
  await writeControl(env, next);
  const planned = Object.entries(next.leagues).filter(([, state]) => state.playCron).map(([slug, state]) => `${slug}:${state.playCron}`);
  console.log(`[CRON-PLAN] date=${formatUtcDate(now)} leagues=${planned.length ? planned.join(",") : "none"}`);
}

export async function ensureDayInitialized(env, tournaments, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (state?.date === today) return false;
  await planTodayPlay(env, tournaments, scheduledTimeMs);
  return true;
}

export async function resolveScheduledExecutionSlugs(env, scheduledTimeMs, eventCron) {
  if (eventCron === BASELINE_CRON) return null;

  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return new Set();

  const slugs = new Set();
  for (const [slug, cronState] of Object.entries(state.leagues)) {
    assertLeagueCronState(slug, cronState);
    if ((cronState.phase === "idle" || cronState.phase === "play") && shouldRunLeagueAt(cronState, now, eventCron)) {
      slugs.add(slug);
    }
    if (cronState.phase === "tail" && (cronState.tailCron1 === eventCron || cronState.tailCron2 === eventCron)) {
      slugs.add(slug);
    }
  }
  return slugs;
}

export async function handleHighFreqTick(env, tournaments, scheduledTimeMs, eventCron) {
  if (eventCron === BASELINE_CRON) return;

  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return;

  let changed = false;
  const entered = [];
  const ended = [];
  for (const [slug, cronState] of Object.entries(state.leagues)) {
    assertLeagueCronState(slug, cronState);
    if (cronState.phase === "idle" && shouldRunLeagueAt(cronState, now, eventCron)) {
      state.leagues[slug] = {
        phase: "play",
        playCron: cronState.playCron,
        playStartHour: cronState.playStartHour,
        playEndHour: cronState.playEndHour,
        tailCron1: null,
        tailCron2: null
      };
      entered.push(slug);
      changed = true;
      continue;
    }
    if (cronState.phase === "tail" && cronState.tailCron2 === eventCron) {
      state.leagues[slug] = buildLeagueIdleState();
      ended.push(slug);
      changed = true;
    }
  }

  if (changed) {
    await updateSchedules(env, collectSchedulesFromState(state));
    await writeControl(env, state);
    if (entered.length) console.log(`[CRON-ENTER] date=${today} slugs=${entered.join(",")} cron=${eventCron}`);
    if (ended.length) console.log(`[CRON-END] date=${today} slugs=${ended.join(",")} final=${eventCron}`);
  }
}

export async function recomputeCronOnMetaChange(env, tournaments, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return;

  const auth = await loginFandom(env);
  const fandomClient = new FandomClient(auth);
  const matchesBySlug = await fetchTodayMatchesUtc(tournaments, fandomClient, now);
  const metas = await fetchTournamentMetasFromHome(env, tournaments);
  const metasBySlug = new Map(metas.map(meta => [meta.slug, meta]));
  let changed = false;
  const restored = [];
  const tailed = [];
  const recalculated = [];

  for (const tournament of tournaments || []) {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    const cronState = state.leagues[slug];
    assertLeagueCronState(slug, cronState);

    const meta = metasBySlug.get(slug) || {};
    const hasUnfinished = !!meta.hasHistoryUnfinished || Number(meta.todayUnfinished) > 0;
    const nextPlayWindow = buildPlayWindow(matchesBySlug.get(slug) || [], meta);

    if (cronState.phase === "tail") {
      if (!hasUnfinished) continue;
      if (!nextPlayWindow) throw new Error(`Cannot restore play cron for ${slug}: unfinished matches exist but no play window calculated`);
      state.leagues[slug] = {
        phase: "play",
        playCron: null,
        playStartHour: nextPlayWindow.startHour,
        playEndHour: nextPlayWindow.endHour,
        tailCron1: null,
        tailCron2: null
      };
      restored.push(`${slug}:${nextPlayWindow.startHour}-${nextPlayWindow.endHour}`);
      changed = true;
      continue;
    }

    if (cronState.phase === "play") {
      if (!hasUnfinished) {
        const tailCron1 = toSinglePointCron(new Date(now.getTime() + 15 * 60 * 1000));
        const tailCron2 = toSinglePointCron(new Date(now.getTime() + 30 * 60 * 1000));
        state.leagues[slug] = { phase: "tail", playCron: null, playStartHour: null, playEndHour: null, tailCron1, tailCron2 };
        tailed.push(`${slug}:${tailCron1}/${tailCron2}`);
        changed = true;
        continue;
      }
      if (nextPlayWindow && (nextPlayWindow.startHour !== cronState.playStartHour || nextPlayWindow.endHour !== cronState.playEndHour)) {
        state.leagues[slug] = {
          phase: "play",
          playCron: null,
          playStartHour: nextPlayWindow.startHour,
          playEndHour: nextPlayWindow.endHour,
          tailCron1: null,
          tailCron2: null
        };
        recalculated.push(`${slug}:${cronState.playStartHour}-${cronState.playEndHour}->${nextPlayWindow.startHour}-${nextPlayWindow.endHour}`);
        changed = true;
      }
      continue;
    }

    if (cronState.phase === "idle" && nextPlayWindow && (nextPlayWindow.startHour !== cronState.playStartHour || nextPlayWindow.endHour !== cronState.playEndHour)) {
      state.leagues[slug] = {
        phase: "idle",
        playCron: null,
        playStartHour: nextPlayWindow.startHour,
        playEndHour: nextPlayWindow.endHour,
        tailCron1: null,
        tailCron2: null
      };
      recalculated.push(`${slug}:idle->${nextPlayWindow.startHour}-${nextPlayWindow.endHour}`);
      changed = true;
    }
  }

  if (!changed) return;
  assignPlayCrons(state, now);
  await updateSchedules(env, collectSchedulesFromState(state));
  await writeControl(env, state);
  if (restored.length) console.log(`[CRON-RESTORE] date=${today} ${restored.join(",")}`);
  if (tailed.length) console.log(`[CRON-SHRINK] date=${today} ${tailed.join(",")}`);
  if (recalculated.length) console.log(`[CRON-RECALC] date=${today} ${recalculated.join(",")}`);
}
