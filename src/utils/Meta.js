import { KV_KEYS } from './constants.js';
import { kvPut } from './kvStore.js';

export function normalizeMetaState(raw) {
  const input = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const tournaments = (input.tournaments && typeof input.tournaments === 'object' && !Array.isArray(input.tournaments))
    ? input.tournaments
    : {};
  const scheduleDayMark = typeof input.scheduleDayMark === 'string' ? input.scheduleDayMark : null;
  return { tournaments: { ...tournaments }, scheduleDayMark };
}

export async function readMetaState(env) {
  const raw = await env["lol-stats-kv"].get(KV_KEYS.META, { type: 'json' });
  return normalizeMetaState(raw);
}

export async function writeMetaState(env, state) {
  const normalized = normalizeMetaState(state);
  await kvPut(env, KV_KEYS.META, JSON.stringify(normalized));
  return normalized;
}
