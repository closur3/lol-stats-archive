import { dateUtils } from '../../utils/dateUtils.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';

export async function refreshScheduleBoardOnDayRollover(env, runtimeConfig, cleanupStaleHomeKeys, refreshHomeStaticFromCache) {
  const kv = env["lol-stats-kv"];
  const today = dateUtils.getNow().dateString;
  const state = await kv.get(kvKeys.scheduleDay(), { type: "json" });
  if (state != null && (typeof state !== "object" || Array.isArray(state))) {
    throw new Error("SCHEDULE_DAY must be a JSON object");
  }
  const lastDay = state?.date || null;
  if (lastDay === today) return;

  await cleanupStaleHomeKeys(env, runtimeConfig);
  await refreshHomeStaticFromCache(env);

  console.log(`[SCHEDULE] ${lastDay || "none"} -> ${today}`);
}
