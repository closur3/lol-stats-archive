import { buildDisplayNameMap, getDisplayName } from './displayName.js';
import { UPDATE_CONFIG } from './types.js';

const getMatchKey = (match) => String(match.MatchId);

const canonicalMatch = (match) => [
  match.MatchId,
  match.Team1,
  match.Team2,
  match.Team1Score,
  match.Team2Score,
  match.DateTimeUTC,
  match.OverviewPage,
  match.BestOf,
  match.Tab
].join("\u001f");

function calcChangedCount(oldData, newData) {
  const oldMap = new Map();
  const newMap = new Map();
  for (const matchRecord of oldData) oldMap.set(getMatchKey(matchRecord), canonicalMatch(matchRecord));
  for (const matchRecord of newData) newMap.set(getMatchKey(matchRecord), canonicalMatch(matchRecord));

  let added = 0;
  let updated = 0;
  for (const [key, nextVal] of newMap.entries()) {
    const prevVal = oldMap.get(key);
    if (prevVal == null) added++;
    else if (prevVal !== nextVal) updated++;
  }
  return { added, updated, changed: added + updated };
}

export function processResults(results, cache, force, forceSlugs, runtimeConfig) {
  const failedSlugs = new Set();
  const syncItems = [];
  const idleItems = [];
  const breakers = [];
  const apiErrors = [];

  const displayNameMap = buildDisplayNameMap(runtimeConfig.TOURNAMENTS);

  results.forEach(resultItem => {
    if (resultItem.status === 'fulfilled') {
      const slug = resultItem.slug;
      const newData = resultItem.data;
      const oldData = cache.rawMatches[slug] ?? [];
      const isForce = force;

      if (!isForce && oldData.length > 10 && newData.length < oldData.length * UPDATE_CONFIG.DROP_THRESHOLD) {
        breakers.push(`${slug}(Drop ${oldData.length}->${newData.length})`);
        failedSlugs.add(slug);
      } else {
        const changedCount = calcChangedCount(oldData, newData);
        cache.rawMatches[slug] = newData;
        if (changedCount.changed > 0) {
          syncItems.push({
            slug,
            displayName: getDisplayName(displayNameMap, slug),
            added: changedCount.added,
            updated: changedCount.updated,
            isForce
          });
        } else {
          idleItems.push({ slug, displayName: getDisplayName(displayNameMap, slug), added: 0, updated: 0, isForce });
        }
      }
    } else {
      const errMsg = resultItem.err?.message || resultItem.err?.toString() || 'unknown';
      console.log(`[PROC-ERR] ${resultItem.slug}: ${errMsg}`);
      apiErrors.push(`${resultItem.slug}(Fail: ${errMsg.substring(0, 50)})`);
      failedSlugs.add(resultItem.slug);
    }
  });

  return { failedSlugs, syncItems, idleItems, breakers, apiErrors, displayNameMap };
}