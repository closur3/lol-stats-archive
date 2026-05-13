import { readPreviousRawMatchesMap, readRawMatchesMap } from '../facts/rawMatchesStore.js';

export async function loadCachedData(env, tournaments) {
  return {
    rawMatches: await readRawMatchesMap(env, tournaments),
    homes: {}
  };
}

export async function loadPreviousCachedData(env, tournaments) {
  return {
    rawMatches: await readPreviousRawMatchesMap(env, tournaments),
    homes: {}
  };
}
