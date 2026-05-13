import { readRawMatchesMap } from '../facts/rawMatchesStore.js';

export async function loadCachedData(env, tournaments, options = {}) {
  return {
    rawMatches: await readRawMatchesMap(env, tournaments, options),
    homes: {}
  };
}
