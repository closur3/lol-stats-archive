import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged } from '../../utils/kvStore.js';

export async function commitRevisionWrites(env, pendingRevisionWrites, failedSlugs = new Set(), failedHomeSlugs = new Set()) {
  const entries = Object.entries(pendingRevisionWrites).filter(([slug, record]) => {
    if (!slug || !record) return false;
    if (failedSlugs.has(slug)) return false;
    if (failedHomeSlugs.has(slug)) return false;
    return true;
  });

  await Promise.all(entries.map(([slug, record]) => {
    return kvPutIfChanged(env, kvKeys.rev(slug), record);
  }));
}