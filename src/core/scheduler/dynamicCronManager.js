import { FandomClient } from "../../api/fandomClient.js";
import { dataUtils } from "../../utils/dataUtils.js";
import { kvKeys } from "../../infrastructure/kv/keyFactory.js";

const BASELINE_CRON = "0 0 * * *";
const WORKER_NAME = "lol-stats";
const WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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
  const all = [];
  for (const tournament of tournaments) {
    const slug = tournament?.slug;
    if (!slug) continue;
    const pages = dataUtils.normalizeOverviewPages(tournament.overview_page);
    if (!pages.length) throw new Error(`overview_page missing: ${slug}`);
    const matches = await fandomClient.fetchAllMatches(slug, pages, { start: dateStr, end: dateStr });
    all.push(...matches);
  }
  return all;
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
      todayUnfinished: Number(meta.todayUnfinished) || 0,
      hasHistoryUnfinished: !!meta.hasHistoryUnfinished
    };
  }));
  return entries.filter(Boolean);
}

function buildPlayCron(matches, metas, nowUtc) {
  let earliest = null;
  for (const match of matches) {
    const raw = match?.DateTimeUTC;
    if (!raw) continue;
    const dt = parseUtcDateTime(raw);
    if (!earliest || dt < earliest) earliest = dt;
  }

  const hasCarryoverUnfinished = (metas || []).some(meta => meta.hasHistoryUnfinished);
  if (!earliest && !hasCarryoverUnfinished) return null;

  const day = WEEKDAY[nowUtc.getUTCDay()];
  const startHour = hasCarryoverUnfinished ? 0 : earliest.getUTCHours();
  return `*/2 ${startHour}-23 * * ${day}`;
}

async function readControl(env) {
  const kv = env["lol-stats-kv"];
  const state = await kv.get(kvKeys.scheduleDay(), { type: "json" });
  if (state == null) return null;
  if (typeof state !== "object" || Array.isArray(state)) throw new Error("SCHEDULE_DAY must be a JSON object");
  return state;
}

async function writeControl(env, state) {
  const kv = env["lol-stats-kv"];
  await kv.put(kvKeys.scheduleDay(), JSON.stringify(state));
}

function buildIdleState(today) {
  return {
    date: today,
    cron: {
      phase: "idle",
      playCron: null,
      tailCron1: null,
      tailCron2: null
    }
  };
}

async function updateSchedules(env, schedules) {
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
  const matches = await fetchTodayMatchesUtc(tournaments, fandomClient, now);
  const metas = await fetchTournamentMetasFromHome(env, tournaments);
  const playCron = buildPlayCron(matches, metas, now);
  const finalSchedules = playCron ? [BASELINE_CRON, playCron] : [BASELINE_CRON];
  await updateSchedules(env, finalSchedules);
  const today = formatUtcDate(now);
  const next = buildIdleState(today);
  if (playCron) next.cron.playCron = playCron;
  await writeControl(env, next);
  console.log(`[CRON-PLAN] date=${formatUtcDate(now)} play=${playCron || "none"}`);
}

export async function ensureDayInitialized(env, tournaments, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (state?.date === today) return false;
  await planTodayPlay(env, tournaments, scheduledTimeMs);
  return true;
}

export async function handleHighFreqTick(env, tournaments, scheduledTimeMs, eventCron) {
  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return;
  const cronState = state.cron;
  if (!cronState || typeof cronState !== "object" || Array.isArray(cronState)) throw new Error("SCHEDULE_DAY.cron must be a JSON object");

  if (cronState.phase === "tail" && (cronState.tailCron1 === eventCron || cronState.tailCron2 === eventCron)) {
    if (cronState.tailCron2 === eventCron) {
      await updateSchedules(env, [BASELINE_CRON]);
      await writeControl(env, {
        date: today,
        cron: { phase: "idle", playCron: null, tailCron1: null, tailCron2: null }
      });
      console.log(`[CRON-END] date=${today} final-cron2 hit -> baseline only`);
    }
    return;
  }
}

export async function recomputeCronOnMetaChange(env, tournaments, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return;
  const cronState = state.cron;
  if (!cronState || typeof cronState !== "object" || Array.isArray(cronState)) throw new Error("SCHEDULE_DAY.cron must be a JSON object");
  if (cronState.phase !== "play" && cronState.phase !== "tail") return;

  const auth = await loginFandom(env);
  const fandomClient = new FandomClient(auth);
  const matches = await fetchTodayMatchesUtc(tournaments, fandomClient, now);
  const metas = await fetchTournamentMetasFromHome(env, tournaments);
  const nextPlayCron = buildPlayCron(matches, metas, now);
  const hasAnyUnfinished = metas.some(meta => meta.hasHistoryUnfinished || meta.todayUnfinished > 0);

  if (cronState.phase === "tail") {
    if (!hasAnyUnfinished) return;
    if (!nextPlayCron) throw new Error("Cannot restore play cron: unfinished matches exist but no play cron calculated");
    await updateSchedules(env, [BASELINE_CRON, nextPlayCron]);
    await writeControl(env, {
      date: today,
      cron: { phase: "play", playCron: nextPlayCron, tailCron1: null, tailCron2: null }
    });
    console.log(`[CRON-RESTORE] date=${today} tail -> play (${nextPlayCron})`);
    return;
  }

  if (!hasAnyUnfinished) {
    const tailCron1 = toSinglePointCron(new Date(now.getTime() + 15 * 60 * 1000));
    const tailCron2 = toSinglePointCron(new Date(now.getTime() + 30 * 60 * 1000));
    await updateSchedules(env, [BASELINE_CRON, tailCron1, tailCron2]);
    await writeControl(env, {
      date: today,
      cron: { phase: "tail", playCron: null, tailCron1, tailCron2 }
    });
    console.log(`[CRON-SHRINK] date=${today} all-finished=1 -> tailCron1=${tailCron1} tailCron2=${tailCron2}`);
    return;
  }

  if (!nextPlayCron || nextPlayCron === cronState.playCron) return;
  await updateSchedules(env, [BASELINE_CRON, nextPlayCron]);
  await writeControl(env, {
    date: today,
    cron: { phase: "play", playCron: nextPlayCron, tailCron1: null, tailCron2: null }
  });
  console.log(`[CRON-RECALC] date=${today} play=${cronState.playCron} -> ${nextPlayCron}`);
}
