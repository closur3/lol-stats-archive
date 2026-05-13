import { timePolicy } from '../../utils/timePolicy.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { cleanupStaleHomeKeys } from './cleanup.js';
import { refreshHomeStaticFromCache } from './cacheRebuilder.js';

export async function refreshScheduleBoardOnDayRollover(env, runtimeConfig) {
  const kv = env["lol-stats-kv"];
  const today = timePolicy.getNow().dateString;
  const state = await kv.get(kvKeys.scheduleDay(), { type: "json" });
  if (state != null && (typeof state !== "object" || Array.isArray(state))) {
    throw new Error("SCHEDULE_DAY must be a JSON object");
  }
  const lastDay = state?.date || null;
  if (lastDay === today) return;

  await cleanupStaleHomeKeys(env, runtimeConfig);
  await refreshHomeStaticFromCache(env);

  console.log(`[SCHED:DAY] ${lastDay || "none"} -> ${today}`);
}
