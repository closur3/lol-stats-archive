import { FandomClient } from "../../api/fandomClient.js";
import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { dataUtils } from "../../utils/dataUtils.js";
import { formatUtcDate } from "./scheduleTime.js";

function parseUtcDateTime(raw) {
  const dt = new Date(raw.replace(" ", "T") + "Z");
  if (Number.isNaN(dt.getTime())) throw new Error(`Invalid DateTimeUTC: ${raw}`);
  return dt;
}

export async function loginFandom(env) {
  return FandomClient.login(env.FANDOM_BOT_USERNAME, env.FANDOM_BOT_PASSWORD);
}

export async function fetchTodayMatchesUtc(tournaments, fandomClient, targetDateUtc) {
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

export async function fetchTournamentMetasFromHome(env, tournaments) {
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

export function buildPlayWindow(matches, meta) {
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

export function buildWindowFromMeta(meta) {
  const hasCarryoverUnfinished = !!meta?.hasHistoryUnfinished;
  const earliest = Number(meta?.todayEarliestTimestamp) || 0;
  if (!hasCarryoverUnfinished && !earliest) return null;
  return {
    startHour: hasCarryoverUnfinished ? 0 : new Date(earliest).getUTCHours(),
    endHour: 23
  };
}
