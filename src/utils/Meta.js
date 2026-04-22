import { KV_KEYS } from './constants.js';
import { kvPut } from './kvStore.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeActiveSlugSet(activeSlugs = null) {
  if (activeSlugs instanceof Set) {
    return new Set(Array.from(activeSlugs).map(slug => String(slug)).filter(Boolean));
  }
  if (Array.isArray(activeSlugs)) {
    return new Set(activeSlugs.map(slug => String(slug)).filter(Boolean));
  }
  return null;
}



export function normalizeTournamentMeta(rawTournamentMeta) {
  const input = isPlainObject(rawTournamentMeta) ? rawTournamentMeta : {};
  const normalized = {};
  if (input.mode === 'fast' || input.mode === 'slow') normalized.mode = input.mode;
  if (typeof input.startTimestamp === 'number' && Number.isFinite(input.startTimestamp)) normalized.startTimestamp = input.startTimestamp;
  if (typeof input.emoji === 'string') normalized.emoji = input.emoji;
  if (typeof input.matchIntervalHours === 'number' && Number.isFinite(input.matchIntervalHours)) normalized.matchIntervalHours = input.matchIntervalHours;
  if (typeof input.hasStarted === 'boolean') normalized.hasStarted = input.hasStarted;
  return normalized;
}

export function tournamentMetaEqual(left, right) {
  const leftNorm = normalizeTournamentMeta(left);
  const rightNorm = normalizeTournamentMeta(right);
  return JSON.stringify(leftNorm) === JSON.stringify(rightNorm);
}

export function normalizeMetaState(raw, activeSlugs = null) {
  const input = isPlainObject(raw) ? raw : {};
  const tournamentsInput = isPlainObject(input.tournaments) ? input.tournaments : {};
  const activeSlugSet = normalizeActiveSlugSet(activeSlugs);
  const tournaments = {};

  Object.entries(tournamentsInput).forEach(([slug, value]) => {
    if (!slug) return;
    if (activeSlugSet && !activeSlugSet.has(slug)) return;
    tournaments[slug] = normalizeTournamentMeta(value);
  });

  const scheduleDayMark = typeof input.scheduleDayMark === 'string' ? input.scheduleDayMark : null;
  return { tournaments, scheduleDayMark };
}



export async function readMetaState(env, activeSlugs = null) {
  const raw = await env["lol-stats-kv"].get(KV_KEYS.META, { type: 'json' });
  return normalizeMetaState(raw, activeSlugs);
}

export async function writeMetaState(env, {
  tournamentMetaBySlug = {},
  scheduleDayMark = null,
  activeSlugs = null
} = {}) {
  const currentRaw = await env["lol-stats-kv"].get(KV_KEYS.META, { type: 'json' });

  // 构建新状态
  const activeSlugSet = normalizeActiveSlugSet(activeSlugs);
  const tournaments = {};
  Object.entries(tournamentMetaBySlug).forEach(([slug, value]) => {
    if (!slug) return;
    if (activeSlugSet && !activeSlugSet.has(slug)) return;
    tournaments[slug] = normalizeTournamentMeta(value);
  });

  const nextScheduleDayMark = typeof scheduleDayMark === 'string'
    ? scheduleDayMark
    : (currentRaw?.scheduleDayMark || null);

  const next = {
    tournaments,
    scheduleDayMark: nextScheduleDayMark
  };

  // 简单对比：无变化则跳过写入
  if (JSON.stringify(currentRaw) === JSON.stringify(next)) {
    return next;
  }

  await kvPut(env, KV_KEYS.META, JSON.stringify(next));
  return next;
}

export async function rewriteMetaState(env, { activeSlugs = null } = {}) {
  const currentRaw = await env["lol-stats-kv"].get(KV_KEYS.META, { type: 'json' });
  const normalized = normalizeMetaState(currentRaw, activeSlugs);
  if (JSON.stringify(currentRaw || {}) === JSON.stringify(normalized)) {
    return normalized;
  }
  await kvPut(env, KV_KEYS.META, JSON.stringify(normalized));
  return normalized;
}
