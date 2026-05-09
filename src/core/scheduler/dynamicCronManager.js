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

function buildWindowCron(matches, nowUtc) {
  if (!matches.length) return null;
  let earliest = null;
  for (const match of matches) {
    const raw = match?.DateTimeUTC;
    if (!raw) continue;
    const dt = parseUtcDateTime(raw);
    if (!earliest || dt < earliest) earliest = dt;
  }
  if (!earliest) return null;
  const day = WEEKDAY[nowUtc.getUTCDay()];
  const startHour = earliest.getUTCHours();
  return `*/2 ${startHour}-23 * * ${day}`;
}

function isMatchFinished(match) {
  const s1 = match?.Team1Score;
  const s2 = match?.Team2Score;
  if (s1 == null || s2 == null) return false;
  if (String(s1).trim() === "" || String(s2).trim() === "") return false;
  return true;
}

function allMatchesFinished(matches) {
  if (!matches.length) return false;
  return matches.every(isMatchFinished);
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
      windowCron: null,
      finalCron1: null,
      finalCron2: null
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

export async function planTodayWindow(env, tournaments, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  const auth = await loginFandom(env);
  const fandomClient = new FandomClient(auth);
  const matches = await fetchTodayMatchesUtc(tournaments, fandomClient, now);
  const windowCron = buildWindowCron(matches, now);
  const finalSchedules = windowCron ? [BASELINE_CRON, windowCron] : [BASELINE_CRON];
  await updateSchedules(env, finalSchedules);
  const today = formatUtcDate(now);
  const next = buildIdleState(today);
  if (windowCron) {
    next.cron.phase = "window";
    next.cron.windowCron = windowCron;
  }
  await writeControl(env, next);
  console.log(`[CRON-PLAN] date=${formatUtcDate(now)} window=${windowCron || "none"}`);
}

export async function ensureDayInitialized(env, tournaments, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (state?.date === today) return false;
  await planTodayWindow(env, tournaments, scheduledTimeMs);
  return true;
}

export async function handleHighFreqTick(env, tournaments, scheduledTimeMs, eventCron) {
  const now = new Date(scheduledTimeMs);
  const today = formatUtcDate(now);
  const state = await readControl(env);
  if (!state || state.date !== today) return;
  const cronState = state.cron;
  if (!cronState || typeof cronState !== "object" || Array.isArray(cronState)) throw new Error("SCHEDULE_DAY.cron must be a JSON object");

  if (cronState.phase === "tail" && (cronState.finalCron1 === eventCron || cronState.finalCron2 === eventCron)) {
    if (cronState.finalCron2 === eventCron) {
      await updateSchedules(env, [BASELINE_CRON]);
      await writeControl(env, {
        date: today,
        cron: { phase: "idle", windowCron: null, finalCron1: null, finalCron2: null }
      });
      console.log(`[CRON-END] date=${today} final-cron2 hit -> baseline only`);
    }
    return;
  }

  if (cronState.phase !== "window" || cronState.windowCron !== eventCron) return;

  const auth = await loginFandom(env);
  const fandomClient = new FandomClient(auth);
  const matches = await fetchTodayMatchesUtc(tournaments, fandomClient, now);
  if (!allMatchesFinished(matches)) return;

  const finalCron1 = toSinglePointCron(new Date(now.getTime() + 30 * 60 * 1000));
  const finalCron2 = toSinglePointCron(new Date(now.getTime() + 60 * 60 * 1000));
  await updateSchedules(env, [BASELINE_CRON, finalCron1, finalCron2]);
  await writeControl(env, {
    date: today,
    cron: { phase: "tail", windowCron: null, finalCron1, finalCron2 }
  });
  console.log(`[CRON-SHRINK] date=${today} all-finished=1 -> finalCron1=${finalCron1} finalCron2=${finalCron2}`);
}
