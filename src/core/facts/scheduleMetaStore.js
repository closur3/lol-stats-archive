import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { computeTournamentMetaFromRawMatches } from "../analysis/tournamentMeta.js";
import { readRawMatches } from "./rawMatchesStore.js";

function readNonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return number;
}

export function assertScheduleMetaFields(label, meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return {
    todayEarliestTimestamp: readNonNegativeInteger(meta.todayEarliestTimestamp, `${label}.todayEarliestTimestamp`),
    todayUnfinished: readNonNegativeInteger(meta.todayUnfinished, `${label}.todayUnfinished`),
    hasHistoryUnfinished: meta.hasHistoryUnfinished === true
  };
}

export function normalizeScheduleMeta(slug, meta) {
  if (!slug) throw new Error("schedule meta slug missing");
  const fields = assertScheduleMetaFields(`SCHEDULE_META.${slug}`, meta);
  return {
    slug,
    ...fields
  };
}

export function sameScheduleMeta(left, right) {
  const leftFields = assertScheduleMetaFields("left SCHEDULE_META", left);
  const rightFields = assertScheduleMetaFields("right SCHEDULE_META", right);
  return leftFields.todayEarliestTimestamp === rightFields.todayEarliestTimestamp
    && leftFields.todayUnfinished === rightFields.todayUnfinished
    && leftFields.hasHistoryUnfinished === rightFields.hasHistoryUnfinished;
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
