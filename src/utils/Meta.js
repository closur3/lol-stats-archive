import { KV_KEYS } from './constants.js';
import { kvPut } from './kvStore.js';

function normalizeTournamentMeta(rawTournamentMeta) {
  const input = (rawTournamentMeta && typeof rawTournamentMeta === 'object' && !Array.isArray(rawTournamentMeta))
    ? rawTournamentMeta
    : {};
  const normalized = {};

  if (input.mode === 'fast' || input.mode === 'slow') normalized.mode = input.mode;
  if (typeof input.startTimestamp === 'number' && Number.isFinite(input.startTimestamp)) normalized.startTimestamp = input.startTimestamp;
  if (typeof input.emoji === 'string') normalized.emoji = input.emoji;
  if (typeof input.matchIntervalHours === 'number' && Number.isFinite(input.matchIntervalHours)) normalized.matchIntervalHours = input.matchIntervalHours;
  if (typeof input.hasStarted === 'boolean') normalized.hasStarted = input.hasStarted;

  return normalized;
}

export function normalizeMetaState(raw, activeSlugs = null) {
  const input = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const tournamentsInput = (input.tournaments && typeof input.tournaments === 'object' && !Array.isArray(input.tournaments))
    ? input.tournaments
    : {};
  const activeSlugSet = activeSlugs instanceof Set
    ? activeSlugs
    : Array.isArray(activeSlugs)
      ? new Set(activeSlugs.map(slug => String(slug)).filter(Boolean))
      : null;
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

export async function writeMetaState(env, { tournamentMetaBySlug = {}, scheduleDayMark = null, activeSlugs = null } = {}) {
  const normalized = normalizeMetaState(
    {
      tournaments: tournamentMetaBySlug,
      scheduleDayMark
    },
    activeSlugs
  );
  await kvPut(env, KV_KEYS.META, JSON.stringify(normalized));
  return normalized;
}
