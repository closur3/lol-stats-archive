import { dateUtils } from '../../utils/dateUtils.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged } from '../../utils/kvStore.js';

export async function refreshScheduleBoardOnDayRollover(env, runtimeConfig, cleanupStaleHomeKeys, refreshHomeStaticFromCache) {
  const kv = env["lol-stats-kv"];
  const today = dateUtils.getNow().dateString;
  const lastDay = await kv.get(kvKeys.scheduleDay());
  if (lastDay === today) return;

  await cleanupStaleHomeKeys(env, runtimeConfig);
  await refreshHomeStaticFromCache(env);

  await kvPutIfChanged(env, kvKeys.scheduleDay(), today);
  console.log(`[SCHEDULE] ${lastDay || "none"} -> ${today}`);
}