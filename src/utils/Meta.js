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

/**
 * 深度比较两个值是否相等（避免JSON序列化的性能开销）
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every(key => deepEqual(a[key], b[key]));
}

export function tournamentMetaEqual(left, right) {
  const leftNorm = normalizeTournamentMeta(left);
  const rightNorm = normalizeTournamentMeta(right);
  return deepEqual(leftNorm, rightNorm);
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
  activeSlugs = null,
  currentRaw = undefined
} = {}) {
  // 复用已读取的数据，避免重复 KV 读取
  const resolvedCurrentRaw = currentRaw !== undefined
    ? currentRaw
    : await env["lol-stats-kv"].get(KV_KEYS.META, { type: 'json' });

  // 保留原有的 scheduleDayMark（除非显式传入新值）
  const resolvedScheduleDayMark = typeof scheduleDayMark === 'string'
    ? scheduleDayMark
    : (resolvedCurrentRaw?.scheduleDayMark || null);

  // 复用 normalizeMetaState 进行规范化
  const next = normalizeMetaState({
    tournaments: tournamentMetaBySlug,
    scheduleDayMark: resolvedScheduleDayMark
  }, activeSlugs);

  // 使用深度比较替代JSON序列化，提升性能
  if (deepEqual(resolvedCurrentRaw, next)) {
    return next;
  }

  await kvPut(env, KV_KEYS.META, JSON.stringify(next));
  return next;
}
