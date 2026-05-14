import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { computeTournamentMetaFromRawMatches } from "../analysis/tournamentMeta.js";
import { readRawMatches } from "./rawMatchesStore.js";

export function normalizeScheduleMeta(slug, meta) {
  if (!slug) throw new Error("schedule meta slug missing");
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error(`SCHEDULE_META must be a JSON object: ${slug}`);
  }
  return {
    slug,
    todayEarliestTimestamp: Number(meta.todayEarliestTimestamp) || 0,
    todayUnfinished: Number(meta.todayUnfinished) || 0,
    hasHistoryUnfinished: !!meta.hasHistoryUnfinished
  };
}

export function sameScheduleMeta(left, right) {
  return Number(left?.todayEarliestTimestamp) === Number(right?.todayEarliestTimestamp)
    && Number(left?.todayUnfinished) === Number(right?.todayUnfinished)
    && !!left?.hasHistoryUnfinished === !!right?.hasHistoryUnfinished;
}

export async function rebuildScheduleMetaFromRawMatches(env, slug) {
  if (!slug) throw new Error("schedule meta slug missing");
  const rawMatches = await readRawMatches(env, slug);
  const computedMeta = computeTournamentMetaFromRawMatches(rawMatches);
  console.log(`[SCHED:META] rebuild ${slug}`);
  return writeScheduleMeta(env, slug, computedMeta);
}

export async function readScheduleMeta(env, slug) {
  if (!slug) throw new Error("schedule meta slug missing");
  const meta = await env["lol-stats-kv"].get(kvKeys.scheduleMeta(slug), { type: "json" });
  if (meta == null) throw new Error(`SCHEDULE_META missing: ${slug}`);
  return normalizeScheduleMeta(slug, meta);
}

export async function ensureScheduleMeta(env, slug) {
  if (!slug) throw new Error("schedule meta slug missing");
  const meta = await env["lol-stats-kv"].get(kvKeys.scheduleMeta(slug), { type: "json" });
  if (meta == null) return rebuildScheduleMetaFromRawMatches(env, slug);
  return normalizeScheduleMeta(slug, meta);
}

export async function ensureScheduleMetas(env, tournaments) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  return Promise.all(tournaments.map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    return ensureScheduleMeta(env, slug);
  }));
}

export async function readScheduleMetas(env, tournaments) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  return Promise.all(tournaments.map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    return readScheduleMeta(env, slug);
  }));
}

export async function writeScheduleMeta(env, slug, meta) {
  const normalized = normalizeScheduleMeta(slug, meta);
  await env["lol-stats-kv"].put(kvKeys.scheduleMeta(slug), JSON.stringify(normalized));
  return normalized;
}
