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

function shallowEqual(left, right) {
  if (left === right) return true;
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (left[key] !== right[key]) return false;
  }
  return true;
}

function tournamentsMetaEqual(left, right) {
  const leftInput = isPlainObject(left) ? left : {};
  const rightInput = isPlainObject(right) ? right : {};
  const leftKeys = Object.keys(leftInput);
  const rightKeys = Object.keys(rightInput);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const slug of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(rightInput, slug)) return false;
    if (!shallowEqual(leftInput[slug], rightInput[slug])) return false;
  }
  return true;
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

export function tournamentMetaEqual(left, right) {
  return shallowEqual(normalizeTournamentMeta(left), normalizeTournamentMeta(right));
}

export function metaStateEqual(left, right) {
  const leftInput = normalizeMetaState(left);
  const rightInput = normalizeMetaState(right);
  if ((leftInput.scheduleDayMark || null) !== (rightInput.scheduleDayMark || null)) return false;
  return tournamentsMetaEqual(leftInput.tournaments, rightInput.tournaments);
}

function resolveNextScheduleDayMark(currentScheduleDayMark, requestedScheduleDayMark) {
  if (requestedScheduleDayMark === null) return null;
  if (typeof requestedScheduleDayMark === 'string') return requestedScheduleDayMark;
  return currentScheduleDayMark || null;
}

export async function readMetaState(env, activeSlugs = null) {
  const raw = await env["lol-stats-kv"].get(KV_KEYS.META, { type: 'json' });
  return normalizeMetaState(raw, activeSlugs);
}

export async function writeMetaState(env, {
  tournamentMetaBySlug = {},
  scheduleDayMark = undefined,
  activeSlugs = null
} = {}) {
  const currentRaw = await env["lol-stats-kv"].get(KV_KEYS.META, { type: 'json' });
  const current = normalizeMetaState(currentRaw, activeSlugs);
  const incoming = normalizeMetaState(
    {
      tournaments: tournamentMetaBySlug,
      scheduleDayMark: resolveNextScheduleDayMark(current.scheduleDayMark, scheduleDayMark)
    },
    activeSlugs
  );
  const next = {
    tournaments: incoming.tournaments || {},
    scheduleDayMark: incoming.scheduleDayMark || null
  };

  const rawNeedsCleanup = JSON.stringify(currentRaw || {}) !== JSON.stringify(current);
  if (!rawNeedsCleanup && metaStateEqual(current, next)) {
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
