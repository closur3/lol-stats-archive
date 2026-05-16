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
  let deleted = 0;
  for (const [key, nextVal] of newMap.entries()) {
    const prevVal = oldMap.get(key);
    if (prevVal == null) added++;
    else if (prevVal !== nextVal) updated++;
  }
  for (const key of oldMap.keys()) {
    if (!newMap.has(key)) deleted++;
  }
  return { added, updated, deleted, changed: added + updated };
}

export function processResults(results, cache, force, forceSlugs, runtimeConfig) {
  const failedSlugs = new Set();
  const syncItems = [];
  const skipItems = [];
  const breakers = [];
  const apiErrors = [];

  const displayNameMap = buildDisplayNameMap(runtimeConfig.TOURNAMENTS);

  results.forEach(resultItem => {
    if (resultItem.status === 'fulfilled') {
      const slug = resultItem.slug;
      const newData = resultItem.data;
      const oldData = cache.rawMatches[slug];
      if (!Array.isArray(oldData)) throw new Error(`RAW_MATCHES missing in previous cache: ${slug}`);
      const isForce = force;

      if (!isForce && oldData.length > 10 && newData.length < oldData.length * UPDATE_CONFIG.DROP_THRESHOLD) {
        breakers.push(`${slug}(Drop ${oldData.length}->${newData.length})`);
        failedSlugs.add(slug);
      } else {
        const changedCount = calcChangedCount(oldData, newData);
        if (changedCount.changed === 0 && changedCount.deleted > 0) {
          if (isForce) {
            cache.rawMatches[slug] = newData;
            skipItems.push({ slug, displayName: getDisplayName(displayNameMap, slug), added: 0, updated: 0, isForce });
          } else {
            console.log(`[UPDATE:DROP_WARN] ${slug} records decreased ${oldData.length}->${newData.length} (deleted=${changedCount.deleted}), preserving cache`);
            skipItems.push({ slug, displayName: getDisplayName(displayNameMap, slug), added: 0, updated: 0, isForce });
          }
        } else {
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
            skipItems.push({ slug, displayName: getDisplayName(displayNameMap, slug), added: 0, updated: 0, isForce });
          }
        }
      }
    } else {
      const errMsg = resultItem.err?.message || resultItem.err?.toString() || 'unknown';
      console.log(`[UPDATE:PROCESS] ${resultItem.slug} error=${errMsg}`);
      apiErrors.push(`${resultItem.slug}(Fail: ${errMsg.substring(0, 50)})`);
      failedSlugs.add(resultItem.slug);
    }
  });

  return { failedSlugs, syncItems, skipItems, breakers, apiErrors, displayNameMap };
}
