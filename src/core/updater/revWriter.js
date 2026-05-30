import { kvKeys } from '../../infrastructure/kv/keyFactory.js';

export async function commitRevisionWrites(env, pendingRevisionWrites, failedSlugs = new Set(), failedHomeSlugs = new Set()) {
  const entries = Object.entries(pendingRevisionWrites).filter(([slug, record]) => {
    if (!slug || !record) return false;
    if (failedSlugs.has(slug)) return false;
    if (failedHomeSlugs.has(slug)) return false;
    return true;
  });

  await Promise.all(entries.map(([slug, record]) => {
    const value = typeof record === "string" ? record : JSON.stringify(record);
    return env["lol-stats-kv"].put(kvKeys.rev(slug), value);
  }));
}