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

  // 简单对比：无变化则跳过写入
  if (JSON.stringify(resolvedCurrentRaw) === JSON.stringify(next)) {
    return next;
  }

  await kvPut(env, KV_KEYS.META, JSON.stringify(next));
  return next;
}
